# Health&Human Repository Instructions

Before working in this repository, read and follow [.agents/rules.md](.agents/rules.md).
It defines mandatory architecture, platform ownership, branch coordination and backend
acceptance rules. Also read `docs/api-contract.md` and the relevant service code/tests.

The rules define ownership for all four team members. Every assignment must state the
member number and M2 task ID; do not infer ownership only from checked-out files.

Flutter is for PATIENT only. Next.js is for DOCTOR, STAFF and ADMIN. Visual design is
pending approval. The current milestone prioritizes backend blockers and integration.

Frontend -> API Gateway -> owning service -> its own database is the required public
request path. Supabase Auth belongs only to User Service. No frontend database access.
