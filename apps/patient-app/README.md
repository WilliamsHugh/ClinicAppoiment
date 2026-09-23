# Health&Human Patient App

Flutter Android shell for the patient-facing clinic application.

## Runtime configuration

The Gateway base URL is supplied at build or run time. Android emulator builds
default to `http://10.0.2.2:8080`.

```sh
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8080
```

The current Android toolchain uses Gradle 9.3.1, Android Gradle Plugin 9.1.0,
Kotlin 2.4.0, and JDK 17. On this workstation, set
`JAVA_HOME=/home/Williams/.local/opt/temurin-17` for Android builds.

## Integration points

- `lib/core/session/session.dart` defines `SessionProvider`, `TokenProvider`,
  the three session states, and trusted profile roles. The default provider is
  unauthenticated. The auth implementation should replace the provider without
  adding a development identity to runtime code.
- `lib/core/api/clinic_api_client.dart` accepts a `TokenProvider` and an
  injectable HTTP transport. It supports GET, POST, PATCH, query parameters,
  idempotency keys, cancellation, timeout, request IDs, structured errors, and
  pagination metadata. It never sends client-provided identity or role headers.
- `lib/app/app_routes.dart` registers the patient routes and role metadata.
  Domain teams can replace each placeholder without changing the shell.

| Route | Module owner |
| --- | --- |
| `/profile` | users/patient profile |
| `/doctors` | specialties, doctors, available slots |
| `/appointments` | appointment booking and management |
| `/records` | patient medical records |
| `/notifications` | patient notifications |

## Verification

```sh
flutter analyze
flutter test
JAVA_HOME=/home/Williams/.local/opt/temurin-17 flutter build apk --debug
```
