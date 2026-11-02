# Health&Human Repository Instructions

Before working in this repository, read and follow [.agents/rules.md](.agents/rules.md).
It defines mandatory architecture, platform ownership, branch coordination and backend
acceptance rules. Also read `docs/api-contract.md` and the relevant service code/tests.

The rules define ownership for all four team members. Every assignment must state the
member number and M2 task ID; do not infer ownership only from checked-out files.

Flutter is for PATIENT only. Next.js is for DOCTOR, STAFF and ADMIN. Visual design is
governed by `docs/ui-design-contract.md`. The current milestone prioritizes backend blockers and integration.

Frontend -> API Gateway -> owning service -> its own database is the required public
request path. Supabase Auth belongs only to User Service. No frontend database access.

---

# UI/UX & Anti-Slop Design Workflow

This workspace enforces an anti-slop, design-system-first UI/UX workflow powered by installed skills in `.agents/skills/`. All agents and contributors designing, reviewing, or implementing UI for Health&Human must strictly follow this workflow.

## A. Design Context

Before implementing a new page or view:
- **Read the existing design contract:** Consult `docs/ui-design-contract.md`, `apps/clinic-management-web/app/globals.css`, and `apps/patient-app/lib/core/theme/app_theme.dart`.
- **Read the relevant page specification:** Check `docs/ui-design-contract.md` (Sections 5–8) and `docs/api-contract.md` for role-based views.
- **Read the applicable UX and accessibility requirements:** Review WCAG 2.1 AA criteria, touch target sizes (≥48px Flutter, ≥44px Web), and contrast ratios (≥4.5:1 text, ≥3:1 controls).
- **Identify the user's primary task:** Determine the single most important action on the page (e.g., booking a slot, confirming check-in, entering diagnosis).
- **Identify the page's information hierarchy:** Determine primary, secondary, and tertiary elements before writing markup.
- **Identify the relevant interaction states:** Map out default, hover, focus-visible, active, disabled, loading, empty, partial, and error states.
- **Rule:** Never choose a new visual direction without consulting the existing design contract.

## B. Design Implementation

During implementation:
- **Use existing design tokens:** Use CSS variables (`var(--brand)`, `var(--primary)`, `var(--ink)`, `var(--surface)`, `var(--radius-*)`, `var(--shadow-*)`) in Web, and `AppTheme` / `ColorScheme` tokens in Flutter. Never invent hardcoded hex codes or arbitrary pixel margins.
- **Reuse existing components:** Utilize components from `apps/clinic-management-web/src/components/ui/` (`Button`, `Input`, `Modal`, `ConfirmModal`, `Alert`, `Badge`, `Skeleton`) and `apps/patient-app/lib/shared/widgets/`.
- **Preserve established typography and color semantics:** Use `Inter` font stack on Web with established weights (400, 500, 600, 700). Maintain status semantics: Success (green), Warning (amber), Danger (red), Info (sky).
- **Follow spacing, radius, and layout rules:** Adhere to the 4px/8px modular spacing scale and established radii (`--radius-sm: 4px`, `--radius-md: 6px`, `--radius-lg: 8px`).
- **Use semantic HTML and accessible controls:** Use proper `<main>`, `<nav>`, `<header>`, `<section>`, `<button>`, `<dialog>`, and accessible form controls with explicit labels and `aria-*` attributes.
- **Avoid introducing unnecessary dependencies:** Do not pull in heavy UI component libraries or animation engines when native CSS/Flutter widgets suffice.
- **Do not create decorative UI elements without a clear purpose:** Every visual element must serve orientation, hierarchy, or affordance.

## C. Anti-AI-Slop Rules

Reject the following patterns unless explicitly justified by the design contract:
- Generic SaaS dashboard templates with uniform 3-card metric rows and purple gradient headers.
- Excessive rounded cards (`border-radius: 24px+` on basic data widgets).
- Unnecessary gradient backgrounds, purple-to-blue glow effects, or decorative floating orbs.
- Decorative glassmorphism (`backdrop-filter: blur()`) applied universally across cards, nav, and modals.
- Repeated card-based layouts for unrelated content.
- Arbitrary font combinations or replacing system/Inter fonts with decorative display fonts.
- Excessive, muddy shadows (`box-shadow` layering without purpose).
- Decorative icons that add no functional meaning or clutter compact tables.
- Unnecessary entrance animations, bouncing buttons, or gratuitous hover transforms.
- Fake statistics, vanity counters, or meaningless dashboard metrics.
- Excessive whitespace that reduces information density on clinical operational screens.
- Inconsistent button styles, sizes, and hover behaviors.
- Arbitrary changes to the established color palette.

*Note: Do not interpret anti-slop as a requirement to make every page minimalistic. The interface must retain its intended visual identity, brand warmth, and clinical clarity.*

## D. UX Requirements

For the clinic booking system, prioritize:
- **Correct service and doctor selection:** Filter by specialty, show clear doctor credentials, and prevent ambiguous selections.
- **Clear appointment availability:** Explicitly separate available, occupied, past, and locked time slots.
- **Accurate date and time presentation:** Always display dates and times in full, explicit local context with ISO standard formatting.
- **Clear booking progress:** For multi-step flows, show current step, completed steps, and clear navigation back/forward.
- **Preservation of user input:** Retain form input across failed API calls or validation errors; never wipe user state.
- **Understandable validation errors:** Inline error messages explaining exactly what needs fixing and how.
- **Confirmation before consequential actions:** Require explicit confirmation modals for cancellation, rescheduling, patient check-in, and completing consultations.
- **Clear appointment status:** Display unambiguous status chips (`PENDING`, `CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
- **Responsive layouts:** Web layouts must gracefully collapse from desktop sidebar to mobile navigation; tables must support horizontal scroll or card reflow on small screens.
- **Keyboard accessibility:** Full tab order, visible focus rings (`:focus-visible`), and Escape key dismissal for modals.
- **Appropriate loading, empty, error, and success states:** Every data-fetching screen must implement skeleton/spinner loading, informative empty states with clear CTAs, actionable error states, and immediate feedback on success.
- **Critical rules:**
  - Never make a disabled or unavailable appointment slot appear bookable.
  - Never rely exclusively on color to communicate appointment status (always pair color with text/badge labels).
  - Do not remove existing functionality to simplify the visual design.

---

## E. Integrated Skills Reference & Conflict Resolution

The following skills are installed in `.agents/skills/` and available for progressive activation:

| Category | Skill Name | Purpose | When to Activate |
| :--- | :--- | :--- | :--- |
| **Core Filter** | `antislop` | Foundation filter: Purpose Test & Delivery Gate | Active on all UI/UX tasks |
| **Taxonomy & Audit** | `antislop-master` | P0–P6 indicator catalog with Quick/Full/Deep audits | Pre-PR and comprehensive UI review |
| **Executable Checklist** | `anti-slop-audit` | 11-point guardrail against framework-default slop | Fast pre-commit verification |
| **Design Review** | `frontend-design-review` | Design system compliance, craft & friction audit | Code review and component implementation |
| **Deep Inquiry** | `grilling-ui` | Socratic pressure-testing of UI decisions | Designing new views or complex workflows |
| **Tokens & System** | `grounding-before-designing` | Enforces using real project tokens before writing code | Before any UI markup/styling |
| **States** | `designing-states-not-screens` | Systematic matrix of loading, empty, error & partial states | Implementing lists, tables, forms |
| **Typography** | `visual-hierarchy-and-type` | Positive typographic scale and hierarchy | Page layouts and heading structures |
| **Interactions** | `interaction-craft` | Accessible focus states, feedback & micro-interactions | Button, modal, and input styling |
| **Copy & Formats** | `precision-copy-and-formatting` | Clinical microcopy, dates, and confirmation dialogs | Error messages, dialog text, labels |
| **Forms** | `antislop-forms` | High-usability form fields and validation | Booking flow and patient intake forms |
| **Mobile & Flutter** | `antislop-mobile` | 44/48px touch targets, mobile ergonomics | Flutter Patient App implementation |
| **Accessibility** | `antislop-human` | WCAG contrast, keyboard accessibility & focus rings | Accessibility verification |

### Conflict Resolution Rule:
When guidance between skills appears to conflict:
1. **Health&Human Design Contract takes absolute precedence:** `docs/ui-design-contract.md` and project tokens (`globals.css`, `app_theme.dart`) govern all color, typography, and styling choices.
2. **Clinical Utility over Decorative Experimentation:** Where `frontend-design-review` suggests expressive/maximalist aesthetics or alternative fonts, Health&Human prioritizes clinical clarity, high information density, and established design tokens over decorative novelty.
3. **No Ungrounded Tokens:** If a skill recommends a pattern that requires new CSS classes or tokens, agents must ground them in existing design tokens rather than inventing new styles.
