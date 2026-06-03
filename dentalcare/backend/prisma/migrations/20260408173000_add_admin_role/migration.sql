-- SQLite stores prisma enums as TEXT for this schema.
-- No DDL is required for adding ADMIN to the Role enum in prisma schema.

-- Normalize any legacy receptionist role values.
UPDATE "User"
SET "role" = 'RECEPTIONIST'
WHERE "role" = 'RECEPTION';
