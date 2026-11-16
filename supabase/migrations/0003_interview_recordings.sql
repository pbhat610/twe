-- Private bucket for interview recordings (camera + mic + interviewer voice),
-- stored as ordered 5-second chunks: interview-recordings/<interview_id>/<seq>.webm
-- Only the server (service-role key) reads/writes; recruiters get short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('interview-recordings', 'interview-recordings', false, 3145728, array['video/webm', 'video/mp4'])
on conflict (id) do nothing;

-- Record of the candidate's consent lives on the interview JSON (recording_consent_at).
-- Retention: remove old recordings through the Storage API (storage.from('interview-recordings').remove([...]))
-- in a scheduled job, per your data-retention policy. Deleting rows from storage.objects directly orphans the files.
