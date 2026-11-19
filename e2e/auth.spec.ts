import { expect, newPage, oobCodes, register, signIn, signOut, test, trackErrors, uniqueUser, visible } from "./helpers";

test.describe("authentication", () => {
  test("registration validates input, then creates a persistent session", async ({ page }) => {
    const errors = trackErrors(page);
    const user = uniqueUser("ana");
    await page.goto("/register");

    // Client-side validation.
    await page.getByTestId("register-submit").click();
    await expect(page.getByText("Enter a display name.")).toBeVisible();
    await expect(page.getByText("Enter your email address.")).toBeVisible();
    await page.getByTestId("register-email").fill("not-an-email");
    await page.getByTestId("register-password").fill("short");
    await page.getByTestId("register-confirm").fill("different");
    await page.getByTestId("register-submit").click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await expect(page.getByText("Passwords don't match.")).toBeVisible();

    await register(page, user);
    await expect(page).toHaveURL(/\/$/);

    // Profile data persisted.
    await page.goto("/profile");
    await expect(page.getByTestId("profile-name")).toHaveText(user.displayName);
    await expect(page.getByTestId("profile-username")).toHaveText(`@${user.username}`);
    await expect(page.getByTestId("profile-email")).toContainText(user.email);

    // Session survives a full reload.
    await page.reload();
    await expect(page.getByTestId("profile-name")).toHaveText(user.displayName);

    // Logout clears the session and protects private pages.
    await signOut(page);
    await page.goto("/profile");
    await expect(page.getByTestId("sign-in-prompt")).toBeVisible();

    // Wrong password is rejected with a clear message; correct password works.
    await page.goto("/login");
    await page.getByTestId("login-email").fill(user.email);
    await page.getByTestId("login-password").fill("wrongpass123");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    await page.getByTestId("login-password").fill(user.password);
    await page.getByTestId("login-submit").click();
    await expect(visible(page.getByTestId("header-profile"))).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("duplicate emails and taken usernames are rejected", async ({ browser }) => {
    const first = uniqueUser("dup");
    const one = await newPage(browser);
    await register(one.page, first);
    await one.context.close();

    const { page } = await newPage(browser);
    await page.goto("/register");
    await page.getByTestId("register-name").fill("Someone Else");
    await page.getByTestId("register-username").fill(first.username);
    await expect(page.getByText(`@${first.username} is already taken.`)).toBeVisible();

    const second = uniqueUser("dup");
    await page.getByTestId("register-username").fill(second.username);
    await page.getByTestId("register-email").fill(first.email);
    await page.getByTestId("register-password").fill(second.password);
    await page.getByTestId("register-confirm").fill(second.password);
    await expect(page.getByText(`@${second.username} is available`)).toBeVisible();
    await page.getByTestId("register-submit").click();
    await expect(page.getByText(/An account with this email already exists/)).toBeVisible();
  });

  test("password reset sends a reset email without revealing account existence", async ({ browser, page }) => {
    const user = uniqueUser("reset");
    const other = await newPage(browser);
    await register(other.page, user);
    await other.context.close();

    await page.goto("/login");
    await page.getByTestId("login-email").fill(user.email);
    await page.getByTestId("forgot-password-link").click();
    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.getByTestId("reset-email")).toHaveValue(user.email);
    await page.getByTestId("reset-submit").click();
    await expect(page.getByTestId("reset-sent")).toBeVisible();
    await expect.poll(async () => (await oobCodes(user.email)).some((c) => c.requestType === "PASSWORD_RESET")).toBe(true);

    // Unknown address: same neutral confirmation.
    await page.getByTestId("reset-email").fill(`nobody_${Date.now()}@example.com`);
    await page.getByTestId("reset-submit").click();
    await expect(page.getByTestId("reset-sent")).toBeVisible();
  });

  test("protected pages ask to sign in and return afterwards; external redirects are blocked", async ({ browser, page }) => {
    const user = uniqueUser("guard");
    const other = await newPage(browser);
    await register(other.page, user);
    await other.context.close();

    await page.goto("/lists");
    await expect(page.getByTestId("sign-in-prompt")).toBeVisible();
    await page.getByRole("button", { name: "Sign in or create an account" }).click();
    await expect(page).toHaveURL(/\/login\?redirect=%2Flists/);
    await page.getByTestId("login-email").fill(user.email);
    await page.getByTestId("login-password").fill(user.password);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/lists$/);
    await expect(visible(page.getByTestId("create-list"))).toBeVisible();

    await signOut(page);
    await page.goto(`/login?redirect=${encodeURIComponent("https://evil.example/phish")}`);
    await page.getByTestId("login-email").fill(user.email);
    await page.getByTestId("login-password").fill(user.password);
    await page.getByTestId("login-submit").click();
    await expect(visible(page.getByTestId("header-profile"))).toBeVisible();
    expect(new URL(page.url()).host).toBe(new URL(test.info().project.use.baseURL!).host);
  });

  test("users can change their password and delete their account", async ({ page }) => {
    const user = uniqueUser("acct");
    await register(page, user);
    await page.goto("/profile");
    await page.getByTestId("change-password").click();
    await page.getByTestId("current-password").fill(user.password);
    await page.getByTestId("new-password").fill("newpass2025");
    await page.getByTestId("confirm-new-password").fill("newpass2025");
    await page.getByTestId("submit-password-change").click();
    await expect(page.getByText("Password changed")).toBeVisible();

    await signOut(page);
    await signIn(page, { ...user, password: "newpass2025" });

    await page.goto("/profile");
    await page.getByTestId("delete-account").click();
    await page.getByTestId("delete-password").fill("newpass2025");
    await expect(page.getByTestId("confirm-delete-account")).toBeDisabled();
    await page.getByTestId("delete-confirm-text").fill("DELETE");
    await page.getByTestId("confirm-delete-account").click();
    await expect(visible(page.getByTestId("header-sign-in"))).toBeVisible();

    // The account no longer exists and the username is free again.
    await page.goto("/login");
    await page.getByTestId("login-email").fill(user.email);
    await page.getByTestId("login-password").fill("newpass2025");
    await page.getByTestId("login-submit").click();
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
    await page.goto("/register");
    await page.getByTestId("register-username").fill(user.username);
    await expect(page.getByText(`@${user.username} is available`)).toBeVisible();
  });
});
