-- Migration: Add authentication fields to users table
-- This migration adds fields needed for email/password authentication and Google OAuth

-- Add password hash field
ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordHash VARCHAR(255);

-- Add authentication method field
ALTER TABLE users ADD COLUMN IF NOT EXISTS authMethod ENUM('password', 'oauth', 'google', 'slack') DEFAULT 'password';

-- Add email verification fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS emailVerificationToken VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS emailVerificationExpires TIMESTAMP NULL;

-- Add password reset fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordResetToken VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordResetExpires TIMESTAMP NULL;

-- Add security fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS registrationIp VARCHAR(45);
ALTER TABLE users ADD COLUMN IF NOT EXISTS lastLoginIp VARCHAR(45);
ALTER TABLE users ADD COLUMN IF NOT EXISTS activatedAt TIMESTAMP NULL;
