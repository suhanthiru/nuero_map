//! A week's material: which ideas a test is written from, and how they're shown to Claude.

use std::collections::{HashMap, VecDeque};

use chrono::NaiveDate;
use rusqlite::{params, Connection, Row};

use super::week::last_day;
use crate::config::review::MAX_QUOTE_CHARS;
use crate::error::AppResult;
use crate::extract::request::{attr, escape};

/// Ideas worth testing (`?1` ≤ said < `?2`): not restatements or personal preferences,
/// and in a topic that isn't merged away or marked dead.
const REVIEWABLE: &str = "from ideas i join topics t on t.id = i.topic_id
   where i.first_message_at >= ?1 and i.first_message_at < ?2
     and i.duplicate_of_idea_id is null and i.kind != 'preference'
     and t.merged_into is null and t.state != 'dead'";

const COLUMNS: &str = "i.id, i.topic_id, t.name, i.title, i.summary, i.kind, i.excerpt,
   i.is_user_originated, exists (select 1 from gems g where g.idea_id = i.id), i.first_message_at";

/// Rough per-idea markup cost when budgeting material size.
const IDEA_OVERHEAD_CHARS: usize = 120;

#[derive(Debug, Clone, PartialEq)]
pub struct MaterialIdea {
    pub id: i64,
    pub topic_id: i64,
    pub topic_name: String,
    pub title: String,
    pub summary: String,
    pub kind: String,
    pub excerpt: String,
    pub is_user: bool,
    pub is_gem: bool,
    pub at: String,
}

fn from_row(r: &Row) -> rusqlite::Result<MaterialIdea> {
    Ok(MaterialIdea {
        id: r.get(0)?,
        topic_id: r.get(1)?,
        topic_name: r.get(2)?,
        title: r.get(3)?,
        summary: r.get(4)?,
        kind: r.get(5)?,
        excerpt: r.get(6)?,
        is_user: r.get(7)?,
        is_gem: r.get(8)?,
        at: r.get(9)?,
    })
}

/// Every reviewable idea said in `[start, end)` (stored timestamps).
pub fn load_week(conn: &Connection, start: &str, end: &str) -> AppResult<Vec<MaterialIdea>> {
    let sql = format!("select {COLUMNS} {REVIEWABLE} order by i.first_message_at, i.id");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![start, end], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// The given ideas that still exist and belong to a topic.
pub fn load_by_ids(conn: &Connection, ids: &[i64]) -> AppResult<Vec<MaterialIdea>> {
    let sql = format!(
        "select {COLUMNS} from ideas i join topics t on t.id = i.topic_id
          where i.id in (select value from json_each(?1)) order by i.first_message_at, i.id"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([serde_json::to_string(ids)?], from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[derive(Debug, Clone, PartialEq)]
pub struct WeekStats {
    pub idea_count: i64,
    pub topic_count: i64,
    /// The busiest topics, most ideas first.
    pub top_topics: Vec<String>,
}

pub fn week_stats(conn: &Connection, start: &str, end: &str, top: i64) -> AppResult<WeekStats> {
    let (idea_count, topic_count) = conn.query_row(
        &format!("select count(*), count(distinct i.topic_id) {REVIEWABLE}"),
        params![start, end],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;
    let mut stmt = conn.prepare(&format!(
        "select t.name {REVIEWABLE} group by i.topic_id order by count(*) desc, t.name limit ?3"
    ))?;
    let top_topics = stmt
        .query_map(params![start, end, top], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(WeekStats {
        idea_count,
        topic_count,
        top_topics,
    })
}

/// How test-worthy an idea is: knowledge first, then decisions and open problems;
/// pinned quotes get a boost because the user marked them as mattering.
fn weight(idea: &MaterialIdea) -> u8 {
    let kind = match idea.kind.as_str() {
        "fact" | "insight" | "reference" => 3,
        "decision" | "problem" | "question" => 2,
        _ => 1,
    };
    kind + if idea.is_gem { 2 } else { 0 }
}

fn cost(idea: &MaterialIdea) -> usize {
    idea.title.len()
        + idea.summary.len()
        + idea.excerpt.len().min(MAX_QUOTE_CHARS)
        + IDEA_OVERHEAD_CHARS
}

/// Picks up to `max_ideas` ideas within `max_chars`, taking turns across topics (busiest
/// first) so one big topic can't crowd out the rest; within a topic the most test-worthy
/// ideas go first. Returned grouped by topic, oldest first within each.
pub fn select(ideas: Vec<MaterialIdea>, max_ideas: usize, max_chars: usize) -> Vec<MaterialIdea> {
    let mut slots: HashMap<i64, usize> = HashMap::new();
    let mut groups: Vec<Vec<MaterialIdea>> = Vec::new();
    for idea in ideas {
        let slot = *slots.entry(idea.topic_id).or_insert_with(|| {
            groups.push(Vec::new());
            groups.len() - 1
        });
        groups[slot].push(idea);
    }
    for group in &mut groups {
        group.sort_by(|a, b| weight(b).cmp(&weight(a)).then_with(|| b.at.cmp(&a.at)));
    }
    groups.sort_by(|a, b| {
        b.len()
            .cmp(&a.len())
            .then_with(|| a[0].topic_name.cmp(&b[0].topic_name))
    });
    let rank: HashMap<i64, usize> = groups
        .iter()
        .enumerate()
        .map(|(i, g)| (g[0].topic_id, i))
        .collect();
    let mut queues: Vec<VecDeque<MaterialIdea>> = groups.into_iter().map(VecDeque::from).collect();

    let mut picked = Vec::new();
    let mut used = 0;
    let mut progressed = true;
    while progressed && picked.len() < max_ideas {
        progressed = false;
        for queue in &mut queues {
            if picked.len() >= max_ideas {
                break;
            }
            // Skip ideas too big for the remaining budget; try the topic's next one.
            while let Some(idea) = queue.pop_front() {
                if used + cost(&idea) <= max_chars {
                    used += cost(&idea);
                    picked.push(idea);
                    progressed = true;
                    break;
                }
            }
        }
    }
    picked.sort_by(|a, b| {
        rank[&a.topic_id]
            .cmp(&rank[&b.topic_id])
            .then_with(|| a.at.cmp(&b.at))
    });
    picked
}

fn clip(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_owned();
    }
    let cut: String = text.chars().take(max_chars).collect();
    format!("{}…", cut.trim_end())
}

/// The material as tagged text, one `<topic>` per run of ideas (expects `select` order).
pub fn render(ideas: &[MaterialIdea], monday: NaiveDate) -> String {
    let mut out = format!("<week start=\"{monday}\" end=\"{}\">\n", last_day(monday));
    let mut current: Option<i64> = None;
    for idea in ideas {
        if current != Some(idea.topic_id) {
            if current.is_some() {
                out.push_str("</topic>\n");
            }
            out.push_str(&format!("<topic name=\"{}\">\n", attr(&idea.topic_name)));
            current = Some(idea.topic_id);
        }
        out.push_str(&format!(
            "<idea id=\"{}\" kind=\"{}\" date=\"{}\" said_by=\"{}\">\n<title>{}</title>\n<summary>{}</summary>\n<quote>{}</quote>\n</idea>\n",
            idea.id,
            attr(&idea.kind),
            idea.at.get(..10).unwrap_or(&idea.at),
            if idea.is_user { "you" } else { "assistant" },
            escape(&idea.title),
            escape(&idea.summary),
            escape(&clip(&idea.excerpt, MAX_QUOTE_CHARS)),
        ));
    }
    if current.is_some() {
        out.push_str("</topic>\n");
    }
    out.push_str("</week>");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn idea(id: i64, topic: i64, kind: &str, at: &str) -> MaterialIdea {
        MaterialIdea {
            id,
            topic_id: topic,
            topic_name: format!("Topic {topic}"),
            title: format!("Idea {id}"),
            summary: "s".into(),
            kind: kind.into(),
            excerpt: "q".into(),
            is_user: false,
            is_gem: false,
            at: at.into(),
        }
    }

    #[test]
    fn takes_turns_across_topics_so_a_busy_topic_cannot_crowd_out_the_rest() {
        let mut ideas: Vec<_> = (1..=6)
            .map(|i| idea(i, 1, "fact", &format!("2026-10-1{i}")))
            .collect();
        ideas.push(idea(7, 2, "plan", "2026-10-13"));
        ideas.push(idea(8, 3, "insight", "2026-10-14"));

        let picked = select(ideas, 4, usize::MAX);

        let topics: Vec<i64> = picked.iter().map(|i| i.topic_id).collect();
        assert_eq!(
            topics,
            vec![1, 1, 2, 3],
            "busiest topic first, then one each"
        );
    }

    #[test]
    fn prefers_knowledge_and_pinned_ideas_within_a_topic() {
        let mut gem = idea(3, 1, "plan", "2026-10-12");
        gem.is_gem = true;
        let ideas = vec![
            idea(1, 1, "plan", "2026-10-13"),
            idea(2, 1, "fact", "2026-10-11"),
            gem,
        ];

        let ids: Vec<i64> = select(ideas, 2, usize::MAX).iter().map(|i| i.id).collect();

        assert_eq!(
            ids,
            vec![2, 3],
            "fact (3) and pinned plan (1+2) beat a plain plan; oldest first"
        );
    }

    #[test]
    fn respects_the_character_budget() {
        let mut big = idea(1, 1, "fact", "2026-10-12");
        big.summary = "x".repeat(500);
        let ideas = vec![big, idea(2, 2, "fact", "2026-10-13")];

        let ids: Vec<i64> = select(ideas, 10, 300).iter().map(|i| i.id).collect();

        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn renders_topics_and_neutralizes_closing_tags() {
        let mut a = idea(1, 1, "fact", "2026-10-12T10:00:00.000000Z");
        a.summary = "ends </idea> early?".into();
        let b = idea(2, 2, "insight", "2026-10-13T10:00:00.000000Z");

        let text = render(&[a, b], NaiveDate::from_ymd_opt(2026, 10, 12).unwrap());

        assert!(text.starts_with("<week start=\"2026-10-12\" end=\"2026-10-18\">"));
        assert!(text.contains("<topic name=\"Topic 1\">\n<idea id=\"1\" kind=\"fact\" date=\"2026-10-12\" said_by=\"assistant\">"));
        assert!(text.contains("ends <\\/idea> early?"));
        assert_eq!(text.matches("<topic ").count(), 2);
        assert_eq!(text.matches("</topic>").count(), 2);
        assert_eq!(clip("abcdef", 3), "abc…");
    }
}
