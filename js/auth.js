// ============================================================
// auth.js
// Everything for creating an account and logging in: the 3-step signup flow (username+password, email+OTP, profile), login, and forgot-password.
// ============================================================

// The reset-password email's link has to point somewhere your browser can
// actually reach later. That's normally wherever the app is currently
// running (window.location) — but if you request a reset while testing on
// a local dev server (localhost/127.0.0.1), that address means nothing to
// your phone or anyone else, so fall back to the real deployed site instead.
const PRODUCTION_URL = "https://campus-connect-224y.vercel.app/";
const RESET_REDIRECT_URL = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)
  ? PRODUCTION_URL
  : window.location.origin + window.location.pathname;

// ---------- Signup state ----------
const signupState = { username: "", password: "", email: "", faculty: "", department: "", avatarDataUrl: "", avatarFile: null };

// ============================================================
// STEP 1 — Account
// ============================================================

// Reusable username field: 6-16 chars, letters/numbers/underscores only.
// Shows a green checkmark once valid. Used on signup Step 1, Login, and
// Forgot Password.
const USERNAME_RE = /^[a-zA-Z0-9_]{6,16}$/;
function setupUsernameField({ inputId, hintId, fieldId }) {
  const inputEl = document.getElementById(inputId);
  const hintEl = document.getElementById(hintId);
  const fieldEl = document.getElementById(fieldId);

  function update() {
    const raw = inputEl.value.trim();
    const value = raw.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20);
    if (value !== raw) inputEl.value = value;
    const valid = USERNAME_RE.test(value);
    fieldEl.classList.remove("has-error");
    fieldEl.classList.toggle("valid", valid);
    hintEl.classList.toggle("ok", valid);
    hintEl.textContent = valid
      ? "Looks good"
      : "6–16 characters: letters, numbers, underscores";
    return { value, valid };
  }

  inputEl.addEventListener("input", update);
  update();
  return update;
}

const updateUsername = setupUsernameField({
  inputId: "username-input", hintId: "username-hint", fieldId: "username-field",
});

// Reusable simple email validation — used on Login and Forgot Password,
// which just need "is this a plausible email", not the full account-
// creation flow that signup Step 2 handles separately.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function setupEmailField({ inputId, fieldId }) {
  const inputEl = document.getElementById(inputId);
  const fieldEl = document.getElementById(fieldId);
  function update() {
    fieldEl.classList.remove("has-error");
    return { value: inputEl.value.trim(), valid: EMAIL_RE.test(inputEl.value.trim()) };
  }
  inputEl.addEventListener("input", update);
  return update;
}
const updateLoginEmail = setupEmailField({ inputId: "login-email-input", fieldId: "field-login-email" });
const updateForgotEmail = setupEmailField({ inputId: "forgot-email-input", fieldId: "field-forgot-email" });

const usernameInput = document.getElementById("username-input");
const usernameField = document.getElementById("username-field");

function setFieldError(fieldId, hasError) {
  document.getElementById(fieldId).classList.toggle("has-error", hasError);
}

const pwField = document.getElementById("password");
const pwConfirmField = document.getElementById("password-confirm");
const continueBtn = document.getElementById("btn-signup-1-continue");

function checkPasswordRules(pw) {
  return { length: pw.length >= 8, lower: /[a-z]/.test(pw), upper: /[A-Z]/.test(pw), number: /[0-9]/.test(pw) };
}
function updatePasswordChecklist() {
  const rules = checkPasswordRules(pwField.value);
  Object.entries(rules).forEach(([rule, met]) => {
    document.querySelector(`#pw-requirements li[data-rule="${rule}"]`).classList.toggle("met", met);
  });
  return Object.values(rules).every(Boolean);
}
function updateContinueState() {
  const username = updateUsername();
  const usernameValid = !!(username && username.valid);
  const passwordValid = updatePasswordChecklist();
  const confirmValid = pwConfirmField.value.length > 0 && pwConfirmField.value === pwField.value;
  setFieldError("field-password-confirm", pwConfirmField.value.length > 0 && !confirmValid);
  const allValid = usernameValid && passwordValid && confirmValid;
  continueBtn.classList.toggle("is-invalid", !allValid);
  return allValid;
}
[usernameInput, pwField, pwConfirmField].forEach((el) => el.addEventListener("input", updateContinueState));

document.querySelectorAll(".pw-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.getElementById(btn.dataset.target);
    const showing = target.type === "text";
    target.type = showing ? "password" : "text";
    btn.classList.toggle("active", !showing);
    btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  });
});

let step1Submitting = false;
continueBtn.addEventListener("click", async () => {
  if (step1Submitting) return;
  const username = updateUsername();
  const usernameValid = !!(username && username.valid);
  const passwordValid = updatePasswordChecklist();
  const confirmValid = pwConfirmField.value.length > 0 && pwConfirmField.value === pwField.value;

  if (!usernameValid || !passwordValid || !confirmValid) {
    const missing = [];
    if (!usernameValid) { missing.push("a valid username"); shakeField(usernameField); }
    if (!passwordValid) { missing.push("the password requirements"); shakeField(document.getElementById("field-password")); }
    if (!confirmValid) { missing.push("matching passwords"); shakeField(document.getElementById("field-password-confirm")); }
    showToast(`Finish ${joinList(missing)} to continue`, "error");
    return;
  }

  // Nothing else to send to the server yet — Supabase Auth needs an email
  // to actually create the account, and that's not collected until Step 2.
  // This step just needs to confirm the chosen username is actually free.
  step1Submitting = true;
  try {
    let available = true;
    await showLoader("Checking username…", async () => {
      const { data, error } = await supabaseClient.rpc("username_available", { p_username: username.value });
      if (error) throw error;
      available = data;
    });

    if (!available) {
      usernameField.classList.add("has-error");
      const hintEl = document.getElementById("username-hint");
      hintEl.classList.remove("ok");
      hintEl.textContent = "That username is already taken — try another";
      shakeField(usernameField);
      return;
    }

    signupState.username = username.value;
    signupState.password = pwField.value;
    setStep(2);
    goto("screen-signup-2");
  } catch (err) {
    console.error("Username check failed:", err);
    showToast("Couldn't check that username — check your connection and try again", "error");
  } finally {
    step1Submitting = false;
  }
});

// ---------- Back buttons ----------
document.getElementById("back-step2").addEventListener("click", () => {
  const otpVisible = document.getElementById("otp-entry").style.display !== "none";
  if (otpVisible) {
    document.getElementById("otp-entry").style.display = "none";
    document.getElementById("email-entry").style.display = "block";
  } else {
    history.back();
  }
});

// ============================================================
// STEP 2 — Email + OTP (auto-verifies on 6th digit)
// ============================================================
const emailInput = document.getElementById("email");
document.getElementById("btn-send-code").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  document.getElementById("email").parentElement.classList.toggle("has-error", !emailOk);
  if (!emailOk) return;

  signupState.email = email;
  const btn = document.getElementById("btn-send-code");
  btn.disabled = true;

  try {
    await showLoader("Sending your verification code…", async () => {
      // This is the point where the account actually gets created — Supabase
      // sends a 6-digit code to the email if the "Confirm signup" template is
      // set up for OTP (see the README's Supabase setup steps; by default
      // Supabase emails a link instead of a code, so that template edit is
      // required for the 6-digit boxes below to receive anything meaningful).
      const { error } = await supabaseClient.auth.signUp({
        email,
        password: signupState.password,
        options: { data: { username: signupState.username } },
      });
      if (error) throw error;
    });

    document.getElementById("email-entry").style.display = "none";
    document.getElementById("otp-entry").style.display = "block";
    document.getElementById("signup2-subtitle").textContent = `Enter the code we sent to ${email}.`;
    startResendCooldown();
    document.querySelector(".otp-digit").focus();
  } catch (error) {
    document.getElementById("email").parentElement.classList.add("has-error");
    showToast((error && error.message) || "Couldn't send the code — try again", "error");
  } finally {
    btn.disabled = false;
  }
});

const otpDigits = document.querySelectorAll(".otp-digit");
const otpRow = document.getElementById("otp-row");
otpDigits.forEach((input, i) => {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "");
    if (input.value && i < otpDigits.length - 1) otpDigits[i + 1].focus();
    const code = Array.from(otpDigits).map((d) => d.value).join("");
    if (code.length === 6) verifyOtp(code);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !input.value && i > 0) otpDigits[i - 1].focus();
  });
});

async function verifyOtp(code) {
  const errorEl = document.getElementById("error-otp");
  errorEl.style.display = "none";
  otpRow.classList.add("checking");
  otpDigits.forEach((d) => (d.disabled = true));

  try {
    await showLoader("Verifying your code…", async () => {
      const { error } = await supabaseClient.auth.verifyOtp({
        email: signupState.email, token: code, type: "signup",
      });
      if (error) throw error;
    });
    showToast("Email verified");
    setStep(3);
    goto("screen-signup-3");
  } catch (error) {
    errorEl.textContent = (error && error.message) || "That code didn't work — check it and try again";
    errorEl.style.display = "block";
    otpDigits.forEach((d) => (d.value = ""));
    otpDigits[0].focus();
  } finally {
    otpRow.classList.remove("checking");
    otpDigits.forEach((d) => (d.disabled = false));
  }
}

let resendInterval;
function startResendCooldown() {
  const btn = document.getElementById("btn-resend-code");
  const timerEl = document.getElementById("resend-timer");
  let seconds = 30;
  btn.disabled = true;
  timerEl.textContent = `(${seconds}s)`;
  clearInterval(resendInterval);
  resendInterval = setInterval(() => {
    seconds -= 1;
    timerEl.textContent = seconds > 0 ? `(${seconds}s)` : "";
    if (seconds <= 0) { clearInterval(resendInterval); btn.disabled = false; }
  }, 1000);
}
document.getElementById("btn-resend-code").addEventListener("click", async () => {
  otpDigits.forEach((d) => (d.value = ""));
  otpDigits[0].focus();
  const { error } = await supabaseClient.auth.resend({ type: "signup", email: signupState.email });
  if (error) { showToast(error.message || "Couldn't resend — try again shortly", "error"); return; }
  showToast(`New code sent to ${signupState.email}`);
  startResendCooldown();
});

// ============================================================
// STEP 3 — Profile (avatar upload, faculty/department search)
// ============================================================
const avatarFile = document.getElementById("avatar-file");
const avatarPicker = document.getElementById("avatar-picker");
const avatarPreview = document.getElementById("avatar-preview");
const avatarPlaceholderText = document.getElementById("avatar-placeholder-text");

avatarPicker.addEventListener("click", () => avatarFile.click());
avatarFile.addEventListener("change", () => {
  const file = avatarFile.files[0];
  if (!file) return;
  signupState.avatarFile = file; // the real file, uploaded once we have a user id (see finishBtn below)
  const reader = new FileReader();
  reader.onload = (e) => {
    signupState.avatarDataUrl = e.target.result; // just for the live preview
    avatarPreview.src = e.target.result;
    avatarPreview.style.display = "block";
    avatarPlaceholderText.style.display = "none";
  };
  reader.readAsDataURL(file);
});

const nameField = document.getElementById("name");
const facultyInput = document.getElementById("faculty-input");
const facultySuggestions = document.getElementById("faculty-suggestions");
const departmentField = document.getElementById("department-field");
const departmentDisplay = document.getElementById("department-display");
const levelSelect = document.getElementById("level");
const finishBtn = document.getElementById("btn-finish-signup");

// Shared department-picker modal — a single instance in the DOM, wired to
// whichever faculty picker last opened it (signup step 3, or profile edit).
const deptModal = document.getElementById("dept-modal");
const deptModalFaculty = document.getElementById("dept-modal-faculty");
const deptSearch = document.getElementById("dept-search");
const deptList = document.getElementById("dept-list");
let activePicker = null;

function openDeptModal(facultyName) {
  deptModalFaculty.textContent = facultyName;
  deptSearch.value = "";
  renderDeptList(facultyName, "");
  deptModal.classList.add("show");
  setTimeout(() => deptSearch.focus(), 300);
}
function renderDeptList(facultyName, query) {
  const q = query.trim().toLowerCase();
  const depts = (FACULTIES[facultyName] || []).filter((d) => d.toLowerCase().includes(q));
  deptList.innerHTML = "";
  if (depts.length === 0) {
    deptList.innerHTML = `<div class="suggestion-empty">No matching department</div>`;
    return;
  }
  depts.forEach((d) => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.textContent = d;
    item.addEventListener("click", () => {
      if (!activePicker) return;
      activePicker.state.department = d;
      activePicker.deptDisplayEl.value = d;
      activePicker.deptFieldEl.style.display = "block";
      deptModal.classList.remove("show");
      activePicker.onChange();
    });
    deptList.appendChild(item);
  });
}
deptSearch.addEventListener("input", () => renderDeptList(activePicker ? activePicker.state.faculty : "", deptSearch.value));
document.getElementById("dept-modal-close").addEventListener("click", () => {
  deptModal.classList.remove("show");
  if (activePicker && !activePicker.state.department) {
    activePicker.state.faculty = "";
    activePicker.inputEl.value = "";
  }
});

// Reusable faculty-typeahead + department-modal wiring. Used for signup
// step 3 and the profile-edit screen — same widget, different state object.
function createFacultyPicker({ inputEl, suggestionsEl, deptFieldEl, deptDisplayEl, deptChangeBtnId, state, onChange }) {
  const picker = { inputEl, suggestionsEl, deptFieldEl, deptDisplayEl, state, onChange };

  function renderSuggestions(query) {
    const q = query.trim().toLowerCase();
    suggestionsEl.innerHTML = "";
    if (!q) { suggestionsEl.classList.remove("show"); return; }
    const matches = Object.keys(FACULTIES).filter((f) => f.toLowerCase().includes(q));
    if (matches.length === 0) {
      suggestionsEl.innerHTML = `<div class="suggestion-empty">No matching faculty</div>`;
    } else {
      matches.forEach((f) => {
        const item = document.createElement("div");
        item.className = "suggestion-item";
        item.textContent = f;
        item.addEventListener("click", () => selectFaculty(f));
        suggestionsEl.appendChild(item);
      });
    }
    suggestionsEl.classList.add("show");
  }
  function selectFaculty(facultyName) {
    state.faculty = facultyName;
    state.department = "";
    inputEl.value = facultyName;
    suggestionsEl.classList.remove("show");
    deptFieldEl.style.display = "none";
    deptDisplayEl.value = "";
    onChange();
    activePicker = picker;
    setTimeout(() => openDeptModal(facultyName), 200);
  }
  inputEl.addEventListener("focus", () => { activePicker = picker; });
  inputEl.addEventListener("input", () => {
    activePicker = picker;
    if (state.faculty && inputEl.value !== state.faculty) {
      state.faculty = "";
      state.department = "";
      deptFieldEl.style.display = "none";
    }
    renderSuggestions(inputEl.value);
    onChange();
  });
  inputEl.addEventListener("blur", () => setTimeout(() => suggestionsEl.classList.remove("show"), 150));
  document.getElementById(deptChangeBtnId).addEventListener("click", () => {
    activePicker = picker;
    openDeptModal(state.faculty);
  });

  return picker;
}

createFacultyPicker({
  inputEl: facultyInput, suggestionsEl: facultySuggestions,
  deptFieldEl: departmentField, deptDisplayEl: departmentDisplay,
  deptChangeBtnId: "dept-change-btn",
  state: signupState, onChange: () => updateFinishState(),
});

// ============================================================
// Resuming an interrupted signup — someone who verified their email (so
// they have a real, working Auth account) but closed the app before
// finishing Step 3, so no `profiles` row exists yet. Without this, both
// login and session-restore would otherwise treat "no profile" as if
// nothing were wrong with their credentials, which is actively
// misleading: their password IS correct, they just have unfinished setup.
// ============================================================
async function resumeProfileSetup() {
  const { data: userData } = await supabaseClient.auth.getUser();
  const user = userData && userData.user;
  signupState.username = (user && user.user_metadata && user.user_metadata.username) || "";
  signupState.email = (user && user.email) || "";
  setStep(3);
  goto("screen-signup-3", "forward", { replace: true });
  showToast("Welcome back — let's finish setting up your profile");
}

function updateFinishState() {
  const valid = !!(nameField.value.trim() && signupState.faculty && signupState.department && levelSelect.value);
  finishBtn.classList.toggle("is-invalid", !valid);
  return valid;
}
[nameField, levelSelect].forEach((el) => el.addEventListener("input", updateFinishState));
levelSelect.addEventListener("change", updateFinishState);

let step3Submitting = false;
finishBtn.addEventListener("click", async () => {
  if (step3Submitting) return;
  const name = nameField.value.trim();
  const missing = [];
  if (!name) { missing.push("your name"); shakeField(nameField.closest(".field")); }
  if (!signupState.faculty) { missing.push("your faculty"); shakeField(facultyInput.closest(".field")); }
  else if (!signupState.department) { missing.push("your department"); shakeField(departmentField.style.display === "none" ? facultyInput.closest(".field") : departmentField); }
  if (!levelSelect.value) { missing.push("your level"); shakeField(levelSelect.closest(".field")); }

  if (missing.length > 0) {
    showToast(`Fill in ${joinList(missing)} to finish`, "error");
    return;
  }

  step3Submitting = true;

  try {
    let userId, avatarUrl = "";
    await showLoader("Setting up your profile…", async () => {
      const { data: userData, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !userData.user) throw userError || new Error("No signed-in user found");
      userId = userData.user.id;

      if (signupState.avatarFile) {
        avatarUrl = await uploadToStorage("avatars", signupState.avatarFile, userId);
      }

      const { error: insertError } = await supabaseClient.from("profiles").insert({
        id: userId, username: signupState.username, name,
        faculty: signupState.faculty, department: signupState.department,
        level: levelSelect.value, avatar_url: avatarUrl || null,
      });
      if (insertError) throw insertError;
    });

    currentUser = {
      id: userId,
      username: signupState.username,
      name,
      faculty: signupState.faculty,
      department: signupState.department,
      level: levelSelect.value,
      avatarDataUrl: avatarUrl,
      tone: signupState.username.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 4,
    };
    initAppShell();
    document.getElementById("welcome-name-line").textContent = `Welcome to the community, ${name.split(" ")[0]}.`;
    goto("screen-post-signup-welcome");
    setTimeout(() => { goto("screen-feed"); maybeStartTour(); }, 2600);
  } catch (err) {
    console.error("Finishing signup failed:", err);
    const msg = err && err.message && err.message.includes("duplicate")
      ? "That username was just taken — go back and pick another"
      : "Couldn't finish setting up your profile — check your connection and try again";
    showToast(msg, "error");
  } finally {
    step3Submitting = false;
  }
});

// ============================================================
// LOGIN / FORGOT PASSWORD
// ============================================================
document.getElementById("btn-login").addEventListener("click", async () => {
  const email = updateLoginEmail();
  const password = document.getElementById("login-password").value;

  if (!email.valid || !password) {
    const missing = [];
    if (!email.valid) { missing.push("your email"); shakeField(document.getElementById("field-login-email")); }
    if (!password) missing.push("your password");
    showToast(`Enter ${joinList(missing)} to log in`, "error");
    return;
  }

  try {
    let needsProfileSetup = false;
    await showLoader("Logging you in…", async () => {
      const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({ email: email.value, password });
      if (signInError) throw new Error("wrong-credentials");

      const { data: profile, error: profileError } = await supabaseClient
        .from("profiles").select("*").eq("id", signInData.user.id).single();
      if (profileError || !profile) { needsProfileSetup = true; return; }

      currentUser = personFromProfileRow(profile);
    });

    if (needsProfileSetup) {
      await resumeProfileSetup();
      return;
    }

    initAppShell();
    showToast("Logged in");
    goto("screen-feed");
    maybeStartTour();
  } catch (err) {
    console.error("Login failed:", err);
    shakeField(document.getElementById("field-login-email"));
    showToast("Wrong email or password", "error");
  }
});

document.getElementById("btn-forgot-send").addEventListener("click", async () => {
  const email = updateForgotEmail();
  if (!email.valid) {
    shakeField(document.getElementById("field-forgot-email"));
    showToast("Enter a valid email", "error");
    return;
  }
  await showLoader("Sending reset link…", async () => {
    await supabaseClient.auth.resetPasswordForEmail(email.value, { redirectTo: RESET_REDIRECT_URL });
  });

  // Same message regardless of whether the email actually has an account —
  // telling the truth here would let someone probe for which emails are
  // registered.
  showToast("If that email has an account, a reset link has been sent");
  history.back();
});

// ============================================================
// RESET PASSWORD — where the emailed reset link actually lands.
// Supabase fires a PASSWORD_RECOVERY auth event once it's parsed the
// recovery token out of the URL; that's our cue to show this screen
// instead of whatever screen would normally show on load.
// ============================================================
let handlingPasswordRecovery = false;

supabaseClient.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    handlingPasswordRecovery = true;
    goto("screen-reset-password", "forward", { replace: true });
  }
});

const resetPwField = document.getElementById("reset-password");
const resetPwConfirmField = document.getElementById("reset-password-confirm");
const resetSubmitBtn = document.getElementById("btn-reset-password-submit");

function updateResetPasswordChecklist() {
  const rules = checkPasswordRules(resetPwField.value);
  Object.entries(rules).forEach(([rule, met]) => {
    document.querySelector(`#reset-pw-requirements li[data-rule="${rule}"]`).classList.toggle("met", met);
  });
  return Object.values(rules).every(Boolean);
}
function updateResetSubmitState() {
  const passwordValid = updateResetPasswordChecklist();
  const confirmValid = resetPwConfirmField.value.length > 0 && resetPwConfirmField.value === resetPwField.value;
  setFieldError("field-reset-password-confirm", resetPwConfirmField.value.length > 0 && !confirmValid);
  const allValid = passwordValid && confirmValid;
  resetSubmitBtn.classList.toggle("is-invalid", !allValid);
  return allValid;
}
[resetPwField, resetPwConfirmField].forEach((el) => el.addEventListener("input", updateResetSubmitState));

let resetSubmitting = false;
resetSubmitBtn.addEventListener("click", async () => {
  if (resetSubmitting) return;
  const passwordValid = updateResetPasswordChecklist();
  const confirmValid = resetPwConfirmField.value.length > 0 && resetPwConfirmField.value === resetPwField.value;

  if (!passwordValid || !confirmValid) {
    const missing = [];
    if (!passwordValid) { missing.push("the password requirements"); shakeField(document.getElementById("field-reset-password")); }
    if (!confirmValid) { missing.push("matching passwords"); shakeField(document.getElementById("field-reset-password-confirm")); }
    showToast(`Finish ${joinList(missing)} to continue`, "error");
    return;
  }

  resetSubmitting = true;

  try {
    let profile;
    await showLoader("Setting your new password…", async () => {
      const { error } = await supabaseClient.auth.updateUser({ password: resetPwField.value });
      if (error) throw error;

      const { data: userData } = await supabaseClient.auth.getUser();
      const { data: profileRow, error: profileError } = await supabaseClient
        .from("profiles").select("*").eq("id", userData.user.id).single();
      if (profileError || !profileRow) throw profileError || new Error("no-profile");
      profile = profileRow;
    });

    handlingPasswordRecovery = false;
    currentUser = personFromProfileRow(profile);
    initAppShell();
    showToast("Password updated — you're logged in");
    goto("screen-feed");
  } catch (err) {
    console.error("Password reset failed:", err);
    showToast((err && err.message) || "Couldn't set your new password — try the reset link again", "error");
  } finally {
    resetSubmitting = false;
  }
});

// ============================================================
// Reset every auth screen back to blank. Called on logout — since this
// is a single-page app, the signup/login/forgot-password inputs live in
// the DOM the whole time and nothing clears them on its own, so the next
// person to sign up would otherwise see the last account's details still
// sitting in the fields.
// ============================================================
function resetAuthForms() {
  // Step 1 — account
  signupState.username = "";
  signupState.password = "";
  signupState.email = "";
  signupState.faculty = "";
  signupState.department = "";
  signupState.avatarDataUrl = "";
  signupState.avatarFile = null;

  usernameInput.value = "";
  pwField.value = "";
  pwConfirmField.value = "";
  usernameField.classList.remove("valid");
  document.getElementById("username-hint").classList.remove("ok");
  document.getElementById("username-hint").textContent = "6–16 characters: letters, numbers, underscores";
  setFieldError("field-password-confirm", false);
  updatePasswordChecklist();
  continueBtn.classList.add("is-invalid");

  // Step 2 — email + OTP
  emailInput.value = "";
  document.getElementById("email").parentElement.classList.remove("has-error");
  document.getElementById("email-entry").style.display = "block";
  document.getElementById("otp-entry").style.display = "none";
  otpDigits.forEach((d) => { d.value = ""; d.disabled = false; });
  document.getElementById("error-otp").style.display = "none";
  clearInterval(resendInterval);

  // Step 3 — profile
  avatarFile.value = "";
  avatarPreview.src = "";
  avatarPreview.style.display = "none";
  avatarPlaceholderText.style.display = "block";
  nameField.value = "";
  facultyInput.value = "";
  departmentField.style.display = "none";
  departmentDisplay.value = "";
  levelSelect.value = "";
  finishBtn.classList.add("is-invalid");

  setStep(1);

  // Login screen
  document.getElementById("login-email-input").value = "";
  document.getElementById("login-password").value = "";
  document.getElementById("field-login-email").classList.remove("has-error");

  // Forgot-password screen
  document.getElementById("forgot-email-input").value = "";
  document.getElementById("field-forgot-email").classList.remove("has-error");

  // Reset-password screen
  resetPwField.value = "";
  resetPwConfirmField.value = "";
}

// Sync initial state
updateContinueState();
