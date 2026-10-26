# Settings review — Oct 26, 2026

Every setting was changed through the Settings screen and checked where it should (and shouldn't)
show up: new estimates, saved jobs, PDFs, client page, card charges, recorded costs, reminders,
backup/restore, a second device, and the pricer while it's open.
**17 groups, 59 checks — all pass** (after 3 fixes below).

## What works
Design/install rates (3 levels each), setup rate, print cost, markup, card fee % (0% hides the fee
line), my costs (only in recorded costs, never in client prices), install speed, contact details on
PDFs and the client page, deposit %, valid days, tax rate (0% works), default notes/terms, materials
(names with quotes/apostrophes/slashes, price changes, removal, reset, duplicates refused), reminder
days (stale estimate, overdue balance, backup), backup + restore (includes Settings), Settings reaching
a second device, and changing Settings while the pricer is open (new estimates re-price, saved jobs keep
their own rates). Saved jobs never changed price in any of the 17 groups.

## Fixed in this pass
1. Markup below 1 (selling below cost) and negative rates were accepted → now refused with a message.
2. Clearing a box silently put back the built-in default → it now keeps your value.
3. "No Laminate" / "None" substrate could be deleted, making every new item start with a laminate and
   a board (and their cost) → can't be removed anymore; restored if an older save lost them.

## Settings you'd need that don't exist yet
Ranked by how often they'd matter and how much money is involved.

### Affects prices on common jobs
1. **Labor per sq ft (cut/weed/mask, print/trim)** — today price = material × markup, so cut lettering
   is $1.20/sq ft (both truck doors' lettering = $8.40) unless you add hours by hand.
2. **Customer-supplied material rates** (print-only and cut-only per sq ft) — the canvas job came out at
   $26.25 in the tool; you charged $168 using the minimum-charge trick.
3. **Markup per material or category** (wrap films vs banners vs rigid boards) — one markup for
   everything makes cheap materials very cheap.
4. **Default minimum job charge** (amount, and on by default) — today it starts off at $25 on every
   job and has to be ticked by hand.
5. **Card fee that matches Stripe** (2.9% + 30¢) and **only when paying by card** — today cash
   clients pay the fee unless the box is unticked, and card jobs lose ~$0.60–$2.50 to Stripe's 30¢.
6. **Client settings**: tax-exempt on file (resale certificate #) so it's ticked automatically,
   wholesale/partner discount, default deposit and terms per client.
7. **No deposit / pay on completion** — 0% isn't possible (it saves 1%), so trusted or net-terms
   clients are still asked for a deposit online.
8. **Waste / overage %** (per material or job) — wraps and roll waste are priced on exact sizes.

### Day-to-day workflow
9. **Tax rate per job** (installs outside the area) — today means changing Settings and back.
10. **Rush fee %** tied to the Rush tag (the tag doesn't change the price).
11. **Trip/travel charge** (per mile or zones) for installs.
12. **Quantity price breaks** (stickers, yard signs, cards).
13. **Invoice terms** (due on receipt / Net 15 / Net 30) with a due date on the invoice.
14. **Default setup time** (fixed at 15 min on every job) and **card-fee box on/off by default**.
15. **Payment methods list** (Venmo, Cash App, ACH… — fixed to Cash/Check/Card/Zelle/Other).
16. **More reminders**: install tomorrow; proof waiting on the client N days.
17. **Tax filing frequency** for the due-date reminder (it assumes quarterly).

### Business details / branding
18. Business address and website on PDFs; phone on invoices and receipts (only estimates now).
19. Starting number and prefix for estimates/invoices (e.g. continue CoreBridge numbering).
20. Logo and colors (built in today).
21. Staged payments (e.g. 50/40/10) for big jobs like monuments — future.
