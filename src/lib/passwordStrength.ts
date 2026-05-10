export interface PasswordStrength {
  label: string;
  color: string;
  pct: string;
}

export function passwordStrength(pwd: string): PasswordStrength {
  if (pwd.length === 0) return { label: "",          color: "bg-surface-4",  pct: "0%"   };
  if (pwd.length < 8)   return { label: "Too short", color: "bg-red-500",    pct: "25%"  };
  if (pwd.length < 12)  return { label: "Weak",      color: "bg-orange-500", pct: "50%"  };
  if (pwd.length < 16)  return { label: "Moderate",  color: "bg-yellow-400", pct: "75%"  };
  return                       { label: "Strong",    color: "bg-accent",     pct: "100%" };
}
