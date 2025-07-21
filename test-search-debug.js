// Quick test script to trigger primary search and analyze results
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://prgzopfgxpcmducwrpwl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByZ3pvcGZneHBjbWR1Y3dycHdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI4MDIxNzksImV4cCI6MjA2ODM3ODE3OX0.dODEjXD6ieJLFvheJTwLqvnw4XznmWlBKUI-hh9RH60'
);

async function testSearch() {
  console.log('Testing primary search with Yamaha MT-07...');
  
  // Trigger primary search for the new config
  const { data, error } = await supabase.functions.invoke('primary-search', {
    body: { searchConfigId: 'd70d2689-feef-4a22-92f7-7a6b7dd69749' }
  });
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Response:', data);
  }
}

testSearch();