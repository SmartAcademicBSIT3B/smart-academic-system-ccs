const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://lhxlfwnuoocnmddyszsa.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoeGxmd251b29jbm1kZHlzenNhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MDg5NzIsImV4cCI6MjA5MTQ4NDk3Mn0.Mpzhx6xErE0HScgVoaq6StPxEAULWlNE-bNAXtF26bc";
const SUPABASE_PASSWORD = "aRturkzIel2FxvIU";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_PASSWORD,
};
