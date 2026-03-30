// tests/core/diff-analyzer.test.ts
import { describe, it, expect } from "vitest";
import { parseDiff, categorizeFile } from "@/core/diff-analyzer.js";

describe("categorizeFile", () => {
  it("categorizes page files", () => {
    expect(categorizeFile("src/app/login/page.tsx")).toBe("page");
    expect(categorizeFile("src/pages/index.tsx")).toBe("page");
    expect(categorizeFile("src/app/dashboard/layout.tsx")).toBe("page");
    expect(categorizeFile("app/about/page.tsx")).toBe("page");
  });

  it("categorizes component files", () => {
    expect(categorizeFile("src/components/Button.tsx")).toBe("component");
    expect(categorizeFile("src/components/ui/Card.tsx")).toBe("component");
  });

  it("categorizes style files", () => {
    expect(categorizeFile("src/styles/globals.css")).toBe("style");
    expect(categorizeFile("src/app/page.module.css")).toBe("style");
    expect(categorizeFile("tailwind.config.ts")).toBe("style");
  });

  it("categorizes API route files", () => {
    expect(categorizeFile("src/app/api/users/route.ts")).toBe("api-route");
    expect(categorizeFile("src/pages/api/auth.ts")).toBe("api-route");
  });

  it("categorizes test files", () => {
    expect(categorizeFile("tests/login.test.ts")).toBe("test");
    expect(categorizeFile("src/__tests__/Button.test.tsx")).toBe("test");
    expect(categorizeFile("src/components/Button.spec.ts")).toBe("test");
  });

  it("categorizes config files", () => {
    expect(categorizeFile("next.config.js")).toBe("config");
    expect(categorizeFile("tsconfig.json")).toBe("config");
    expect(categorizeFile(".eslintrc.json")).toBe("config");
  });

  it("categorizes utility files", () => {
    expect(categorizeFile("src/lib/utils.ts")).toBe("util");
    expect(categorizeFile("src/utils/format.ts")).toBe("util");
    expect(categorizeFile("src/helpers/auth.ts")).toBe("util");
  });

  it("categorizes unknown files as other", () => {
    expect(categorizeFile("README.md")).toBe("other");
    expect(categorizeFile("Dockerfile")).toBe("other");
  });
});

describe("parseDiff", () => {
  it("parses a unified diff into FileChange objects", () => {
    const rawDiff = `diff --git a/src/app/login/page.tsx b/src/app/login/page.tsx
index abc1234..def5678 100644
--- a/src/app/login/page.tsx
+++ b/src/app/login/page.tsx
@@ -10,6 +10,8 @@ export default function LoginPage() {
   const [email, setEmail] = useState('');
+  const [error, setError] = useState('');
+  const [touched, setTouched] = useState(false);
   return (
diff --git a/src/components/Button.tsx b/src/components/Button.tsx
index 1111111..2222222 100644
--- a/src/components/Button.tsx
+++ b/src/components/Button.tsx
@@ -1,4 +1,4 @@
-export function Button({ children }) {
+export function Button({ children, variant = "primary" }) {
   return <button>{children}</button>;
 }`;

    const result = parseDiff(rawDiff);

    expect(result.files).toHaveLength(2);
    expect(result.files[0].path).toBe("src/app/login/page.tsx");
    expect(result.files[0].category).toBe("page");
    expect(result.files[0].status).toBe("modified");
    expect(result.files[0].hunks).toHaveLength(1);

    expect(result.files[1].path).toBe("src/components/Button.tsx");
    expect(result.files[1].category).toBe("component");

    expect(result.summary.totalFiles).toBe(2);
    expect(result.summary.categories.page).toBe(1);
    expect(result.summary.categories.component).toBe(1);
  });

  it("handles new file diffs", () => {
    const rawDiff = `diff --git a/src/app/signup/page.tsx b/src/app/signup/page.tsx
new file mode 100644
index 0000000..abc1234
--- /dev/null
+++ b/src/app/signup/page.tsx
@@ -0,0 +1,10 @@
+export default function SignupPage() {
+  return <div>Signup</div>;
+}`;

    const result = parseDiff(rawDiff);
    expect(result.files[0].status).toBe("added");
    expect(result.files[0].additions).toBe(3);
    expect(result.files[0].deletions).toBe(0);
  });

  it("handles deleted file diffs", () => {
    const rawDiff = `diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index abc1234..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-export const old = true;
-export const unused = false;`;

    const result = parseDiff(rawDiff);
    expect(result.files[0].status).toBe("deleted");
    expect(result.files[0].deletions).toBe(2);
  });

  it("returns empty analysis for empty diff", () => {
    const result = parseDiff("");
    expect(result.files).toHaveLength(0);
    expect(result.summary.totalFiles).toBe(0);
  });
});
