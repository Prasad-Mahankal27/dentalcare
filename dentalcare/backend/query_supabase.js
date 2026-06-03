const { createClient } = require("@supabase/supabase-js");
const { loadEnv } = require("./config/loadEnv");
loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase credentials in env!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log("Querying Supabase for users...");
  
  // Query clinic_sync_records for users
  const { data: syncData, error: syncError } = await supabase
    .from("clinic_sync_records")
    .select("*")
    .eq("entity", "users");
    
  if (syncError) {
    console.error("Error fetching sync records:", syncError);
  } else {
    console.log("Sync records count:", syncData.length);
    console.log("Users in clinic_sync_records:");
    syncData.forEach(row => {
      let payloadParsed = null;
      try { 
        if (typeof row.payload === 'string') {
          payloadParsed = JSON.parse(row.payload); 
        } else {
          payloadParsed = row.payload;
        }
      } catch {}
      console.log(`- Clinic: ${row.clinic_id}, Entity: ${row.entity}, Key: ${row.record_key}, Deleted: ${row.is_deleted}`);
      console.log("  Payload:", JSON.stringify(payloadParsed));
    });
  }

  // Query users table
  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("*");

  if (userError) {
    console.error("Error fetching users table:", userError);
  } else {
    console.log("\nUsers in 'users' table:");
    console.log(JSON.stringify(userData, null, 2));
  }
}

main().catch(console.error);
