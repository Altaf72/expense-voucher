"use client";
// Login Page
// This is the first screen all users see when they open the app

import { useState } from "react";
import { loginUser, getDashboardByRole } from "../../lib/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  // These store what the user types
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Runs when user clicks Login button
  async function handleLogin() {
    setError("");
    setLoading(true);

    const result = await loginUser(email, password);

    if (result.success) {
      // Send user to correct dashboard based on their role
      const dashboard = getDashboardByRole(result.user.role);
      router.push(dashboard);
    } else {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>

      {/* Logo / Title */}
      <div style={styles.card}>
        <h1 style={styles.title}>Expense Voucher System</h1>
        <p style={styles.subtitle}>Sign in to continue</p>

        {/* Error message box */}
        {error && (
          <div style={styles.errorBox}>
            ⚠️ {error}
          </div>
        )}

        {/* Email input */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Email Address</label>
          <input
            style={styles.input}
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Password input */}
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Password</label>
          <input
            style={styles.input}
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {/* Login button */}
        <button
          style={loading ? styles.buttonDisabled : styles.button}
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>

        <p style={styles.hint}>
          Contact your administrator if you need access.
        </p>
      </div>
    </div>
  );
}

// Styles - clean and mobile friendly
const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0f4f8",
    padding: "20px",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    padding: "40px",
    width: "100%",
    maxWidth: "400px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
  },
  title: {
    fontSize: "22px",
    fontWeight: "600",
    color: "#1a1a2e",
    marginBottom: "6px",
    textAlign: "center",
  },
  subtitle: {
    fontSize: "14px",
    color: "#666",
    textAlign: "center",
    marginBottom: "28px",
  },
  errorBox: {
    backgroundColor: "#fff0f0",
    border: "1px solid #ffcccc",
    borderRadius: "8px",
    padding: "12px",
    marginBottom: "16px",
    fontSize: "13px",
    color: "#cc0000",
  },
  fieldGroup: {
    marginBottom: "18px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: "500",
    color: "#444",
    marginBottom: "6px",
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    fontSize: "14px",
    color: "#333",
    outline: "none",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#1a1a2e",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "500",
    cursor: "pointer",
    marginTop: "8px",
  },
  buttonDisabled: {
    width: "100%",
    padding: "12px",
    backgroundColor: "#999",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "500",
    cursor: "not-allowed",
    marginTop: "8px",
  },
  hint: {
    fontSize: "12px",
    color: "#999",
    textAlign: "center",
    marginTop: "16px",
  },
};