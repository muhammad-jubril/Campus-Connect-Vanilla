// Fill these in with your Supabase project's URL and anon/public key.
// Project Settings → API in your Supabase dashboard.
const SUPABASE_URL = "https://annmbmuuiqvutgvvkpet.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFubm1ibXV1aXF2dXRndnZrcGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTYwNjYsImV4cCI6MjEwMDQ3MjA2Nn0.icBh4PWOqXyEjY657iTHFJvhpklNTFy5z7muklQ3inU";

const supabaseClient = (SUPABASE_URL.startsWith("http"))
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

if (!supabaseClient) {
  // Unlike earlier versions of this app, there's no mock-data fallback
  // anymore — every screen genuinely needs a real Supabase connection now.
  // Fail loudly and visibly here, so "nothing happens when I tap Continue"
  // doesn't turn into a confusing debugging session later.
  window.addEventListener("DOMContentLoaded", () => {
    document.body.innerHTML =
      '<div style="max-width:420px;margin:80px auto;padding:24px;font-family:sans-serif;text-align:center;">' +
      '<h2 style="margin-bottom:12px;">Supabase isn\'t set up yet</h2>' +
      '<p style="color:#555;line-height:1.5;">Open <code>supabase-config.js</code> and fill in your project URL and anon key — see the README\'s \"Wire up Supabase\" section for the full setup steps.</p>' +
      '</div>';
  });
}
