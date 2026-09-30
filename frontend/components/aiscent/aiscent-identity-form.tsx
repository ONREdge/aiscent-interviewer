'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { AiscentMountainRidges } from '@/components/aiscent/aiscent-mountain-ridges';
import { AiscentFrostedCard } from '@/components/aiscent/aiscent-frosted-card';

export interface AiscentIdentity {
  first_name: string;
  last_name: string;
  email: string;
}

interface AiscentIdentityFormProps {
  onSubmit: (identity: AiscentIdentity) => void;
  onBack?: () => void;
  className?: string;
}

// Trim + cap lengths matching the server-side validation contract in
// /api/aiscent-connection-details so what the user submits is exactly what
// gets embedded in the JWT metadata (no silent truncation on the way in).
const MAX_NAME = 64;
const MAX_EMAIL = 254;

// Deliberately permissive: match "a@b.c" style shapes but let the browser's
// native `type="email"` validation do the heavy lifting. Anything past this
// is user's problem — we're capturing an inbox, not verifying it.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AiscentIdentityForm({
  onSubmit,
  onBack,
  className,
}: AiscentIdentityFormProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');

  const trimmed = useMemo(
    () => ({
      first_name: firstName.trim().slice(0, MAX_NAME),
      last_name: lastName.trim().slice(0, MAX_NAME),
      email: email.trim().slice(0, MAX_EMAIL),
    }),
    [firstName, lastName, email]
  );

  const isValid =
    trimmed.first_name.length > 0 &&
    trimmed.last_name.length > 0 &&
    EMAIL_RE.test(trimmed.email);

  const submitDisabled = !isValid;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitDisabled) return;
    onSubmit(trimmed);
  };

  return (
    <div
      className={`fixed inset-0 z-10 overflow-y-auto overflow-x-hidden${
        className ? ` ${className}` : ''
      }`}
      style={{ background: '#F7F5F1' }}
    >
      <AiscentMountainRidges />

      <div
        className="relative flex flex-col"
        style={{
          minHeight: '100vh',
          padding:
            'clamp(20px, 5vw, 32px) clamp(16px, 4vw, 48px) clamp(24px, 4vw, 40px)',
        }}
      >
        <header
          className="aiscent-header-row"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            marginBottom: 24,
          }}
        >
          <Image
            src="/aiscent/ascent-logo.png"
            alt="AiSCENT"
            width={168}
            height={44}
            priority
            style={{ height: 44, width: 'auto', display: 'block' }}
          />
          <div
            className="aiscent-tagline"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 3,
              color: '#1B3B72',
              whiteSpace: 'nowrap',
            }}
          >
            SEE THE ROUTE. SHAPE WHAT&apos;S NEXT.
          </div>
        </header>

        <div
          style={{
            flex: '1 1 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AiscentFrostedCard
            maxWidth="640px"
            padding="clamp(28px, 5vw, 48px) clamp(20px, 4vw, 48px)"
            style={{ margin: '0 auto' }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                borderRadius: 999,
                background: '#1565E2',
                boxShadow: '0 8px 24px rgba(21,101,226,0.28)',
                marginBottom: 24,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: '#C9A227',
                }}
              />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 3,
                  color: '#FFFFFF',
                }}
              >
                BEFORE YOU BEGIN
              </span>
            </div>

            <h1
              style={{
                fontFamily: "var(--font-poppins), 'Poppins', sans-serif",
                fontWeight: 600,
                fontSize: 'clamp(26px, 4.4vw, 36px)',
                lineHeight: 1.15,
                letterSpacing: -0.8,
                color: '#14181D',
                margin: '0 0 14px',
              }}
            >
              Enter your info to take the survey and get your results.
            </h1>

            <p
              style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: '#4A5563',
                margin: '0 0 28px',
              }}
            >
              We use this to attach your AiSCENT Position to your name when the interview wraps up and send you the results.
            </p>

            <form onSubmit={handleSubmit} noValidate={false}>
              <div
                className="aiscent-identity-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <IdentityField
                  id="aiscent-first-name"
                  label="First name"
                  value={firstName}
                  onChange={setFirstName}
                  autoComplete="given-name"
                  maxLength={MAX_NAME}
                  required
                />
                <IdentityField
                  id="aiscent-last-name"
                  label="Last name"
                  value={lastName}
                  onChange={setLastName}
                  autoComplete="family-name"
                  maxLength={MAX_NAME}
                  required
                />
              </div>

              <div style={{ marginBottom: 28 }}>
                <IdentityField
                  id="aiscent-email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  autoComplete="email"
                  maxLength={MAX_EMAIL}
                  required
                  inputMode="email"
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="submit"
                  disabled={submitDisabled}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    padding: '16px 34px',
                    borderRadius: 999,
                    border: 'none',
                    background: '#1565E2',
                    color: '#FFFFFF',
                    fontFamily: "var(--font-space-grotesk), sans-serif",
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    cursor: submitDisabled ? 'not-allowed' : 'pointer',
                    boxShadow: '0 12px 28px rgba(21,101,226,0.30)',
                    transition:
                      'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
                    opacity: submitDisabled ? 0.55 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (submitDisabled) return;
                    (e.currentTarget as HTMLButtonElement).style.transform =
                      'translateY(-1px)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow =
                      '0 16px 34px rgba(21,101,226,0.36)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform =
                      'translateY(0)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow =
                      '0 12px 28px rgba(21,101,226,0.30)';
                  }}
                >
                  Start the interview
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.18)',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                    }}
                  >
                    →
                  </span>
                </button>

                {onBack ? (
                  <button
                    type="button"
                    onClick={onBack}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: '10px 4px',
                      color: '#1B3B72',
                      fontFamily: "var(--font-space-grotesk), sans-serif",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: 0.4,
                      cursor: 'pointer',
                    }}
                  >
                    ← Back
                  </button>
                ) : null}
              </div>

              <p
                style={{
                  fontSize: 12,
                  color: '#8A8378',
                  marginTop: 22,
                  marginBottom: 0,
                }}
              >
                Your info stays with the interview results. Nothing is shared
                publicly.
              </p>
            </form>
          </AiscentFrostedCard>
        </div>
      </div>
    </div>
  );
}

interface IdentityFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: 'text' | 'email';
  autoComplete?: string;
  maxLength?: number;
  required?: boolean;
  inputMode?: 'text' | 'email';
}

function IdentityField({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  maxLength,
  required,
  inputMode,
}: IdentityFieldProps) {
  return (
    <label
      htmlFor={id}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.5,
          color: '#1B3B72',
          textTransform: 'uppercase',
        }}
      >
        {label}
        {required ? (
          <span aria-hidden="true" style={{ color: '#C13020', marginLeft: 4 }}>
            *
          </span>
        ) : null}
      </span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required={required}
        inputMode={inputMode}
        spellCheck={false}
        style={{
          appearance: 'none',
          background: 'rgba(255,255,255,0.85)',
          border: '1px solid rgba(21,101,226,0.28)',
          borderRadius: 12,
          padding: '12px 14px',
          fontFamily: "var(--font-space-grotesk), sans-serif",
          fontSize: 15,
          color: '#14181D',
          outline: 'none',
          boxShadow: '0 1px 2px rgba(27,59,114,0.05)',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#1565E2';
          e.currentTarget.style.boxShadow =
            '0 0 0 3px rgba(21,101,226,0.15)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgba(21,101,226,0.28)';
          e.currentTarget.style.boxShadow = '0 1px 2px rgba(27,59,114,0.05)';
        }}
      />
    </label>
  );
}
