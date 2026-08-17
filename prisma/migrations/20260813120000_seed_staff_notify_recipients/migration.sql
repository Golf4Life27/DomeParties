-- Turn staff notifications ON for the live venue.
--
-- staffNotifyEmail has never been filled in on the production row, and
-- notifyStaff() no-ops when it is blank — so every new booking, cancellation
-- and balance payment so far has alerted nobody. The admin shows a warning
-- banner for this, but a banner only helps someone already looking at the
-- admin, which is exactly who does not need the alert.
--
-- Backfill only. The WHERE clause means this is a no-op the moment anyone has
-- set a value in Settings, so re-running deploys (and a later hand-edit of the
-- list) are both safe.
UPDATE "Setting"
   SET "staffNotifyEmail" = 'Alex@whitetailridgegc.com, Billy@whitetailridgegc.com'
 WHERE "id" = 1
   AND ("staffNotifyEmail" IS NULL OR btrim("staffNotifyEmail") = '');
