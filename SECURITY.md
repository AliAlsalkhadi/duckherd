# Security

Duckherd runs locally, with no server and no telemetry. By default it makes a few small model calls through Claude Code (Haiku or Sonnet) to judge task effort, digest helper reports, name lesson topics and compact transcripts, with likely secrets blanked first. Only the effort judge can be turned off (`/chat-effort off`).

To report a vulnerability, use GitHub's private reporting: the Security tab, then "Report a vulnerability". Please don't open a public issue. Include what you found, how to reproduce it, and the version.
