# Logging contract

All six backend services use the same concise request-completion format:

```text
[api-gateway] GET /health 200 3ms rid=46e2a687-7246-4b6d-a81b-4a97afb9e529
```

The prefix is one of `api-gateway`, `user-service`, `doctor-service`,
`appointment-service`, `medical-record-service`, or `notification-service`.
Every completed HTTP request produces one line containing the method, path, HTTP
status, elapsed milliseconds, and the propagated `X-Request-Id`. Services preserve a
valid incoming request ID; otherwise they generate a UUID and return it in the
`X-Request-Id` response header.

Request paths exclude query strings and replace IDs after known resource segments with
`:id`. Do not log request or response bodies, credentials, tokens, names, contact
details, appointment identifiers, or raw error objects. Request failures are visible
from the completion status; a separate event log may add a safe error code when needed.

Non-request events use this format:

```text
[notification-service] ERROR reminder.dispatch_failed
```

Event names are stable lowercase identifiers. Optional fields are limited to safe
operational metadata such as `port`, `statusCode`, `durationMs`, `requestId`, and
standardized error `code`. Do not pass patient or credential data to the event logger.
