-- Split "contacted" in two: CONTACTED now means the customer replied, and
-- NO_RESPONSE marks a lead staff reached that never answered, so those can be
-- found and worked again. Leads already marked CONTACTED stay as they are.
ALTER TYPE "LeadStatus" ADD VALUE 'NO_RESPONSE' AFTER 'CONTACTED';
