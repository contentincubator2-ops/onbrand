-- Migration: Add authentication fields to users table
-- Fixed for MySQL compatibility

-- Add password hash field
ALTER TABLE users ADD COLUMN passwordHash VARCHAR(255) NULL;

-- Add authentication method field
ALTER TABLE users ADD COLUMN authMethod ENUM('password', 'oauth', 'google', 'slack') DEFAULT 'password';

-- Add email verification fields
ALTER TABLE users ADD COLUMN emailVerificationToken VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN emailVerificationExpires TIMESTAMP NULL;

-- Add password reset fields
ALTER TABLE users ADD COLUMN passwordResetToken VARCHAR(255) NULL;
ALTER TABLE users ADD COLUMN passwordResetExpires TIMESTAMP NULL;

-- Add security fields
ALTER TABLE users ADD COLUMN registrationIp VARCHAR(45) NULL;
ALTER TABLE users ADD COLUMN lastLoginIp VARCHAR(45) NULL;
ALTER TABLE users ADD COLUMN activatedAt TIMESTAMP NULL;
