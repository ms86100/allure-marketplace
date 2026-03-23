

## Fix: Add missing `notes` column to `service_bookings`

The new canonical `book_service_slot` function references a `notes` column in the `INSERT INTO service_bookings(...)` statement, but that column doesn't exist on the table.

### Change

**Database migration** — Add the column:

```sql
ALTER TABLE public.service_bookings ADD COLUMN IF NOT EXISTS notes text;
```

That's it. One column addition, no code changes needed.

