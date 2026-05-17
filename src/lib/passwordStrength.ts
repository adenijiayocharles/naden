export interface PasswordStrength {
  label: string;
  color: string;
  pct: string;
}

export function passwordStrength(pwd: string): PasswordStrength {
  if (pwd.length === 0) return { label: "",          color: "bg-surface-4",  pct: "0%"  };
  if (pwd.length < 8)   return { label: "Too short", color: "bg-red-500",    pct: "25%" };

  const hasUpper  = /[A-Z]/.test(pwd);
  const hasLower  = /[a-z]/.test(pwd);
  const hasDigit  = /[0-9]/.test(pwd);
  const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
  const classes   = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

  // Require both adequate length and character diversity for higher tiers.
  if (pwd.length >= 16 && classes >= 3) return { label: "Strong",   color: "bg-accent",     pct: "100%" };
  if (pwd.length >= 12 && classes >= 2) return { label: "Moderate", color: "bg-yellow-400", pct: "75%"  };
  return                                       { label: "Weak",     color: "bg-orange-500", pct: "50%"  };
}
