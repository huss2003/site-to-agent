-- Site-to-Agent schema. Run in the Supabase SQL editor. All vectors are 1024-d.
create extension if not exists vector;

create table if not exists agents (
  id          text primary key,
  url         text not null,
  name        text not null,
  embedder    text not null,
  pages       int  not null default 0,
  chunks      int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists chunks (
  id         text primary key,
  agent_id   text not null references agents(id) on delete cascade,
  url        text not null,
  title      text not null default '',
  idx        int  not null,
  content    text not null,
  embedding  vector(1024) not null
);

create index if not exists chunks_agent_idx on chunks (agent_id);
create index if not exists chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

-- Cosine-similarity search scoped to one agent.
create or replace function match_chunks(
  p_agent text,
  query_embedding vector(1024),
  match_count int default 20
) returns table (id text, agent_id text, url text, title text, idx int, content text, similarity float)
language sql stable as $$
  select c.id, c.agent_id, c.url, c.title, c.idx, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.agent_id = p_agent
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- The app uses the service-role key server-side only; lock the tables for anon/auth roles.
alter table agents enable row level security;
alter table chunks enable row level security;
