const DENIED = new Set(["password123", "password1234", "1234567890", "qwertyuiop", "changeme123", "letmein123"]);

/** Same rules as the backend PasswordConstraint. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10 || password.length > 128 || /\s/.test(password) || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must be 10-128 characters, with no spaces, and include a letter and a digit.";
  }
  if (DENIED.has(password.toLowerCase())) {
    return "Choose a less common password.";
  }
  return null;
}

