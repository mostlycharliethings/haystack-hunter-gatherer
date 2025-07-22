import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { jobName, action } = await req.json()

    if (action === 'toggle') {
      // Get current job status
      const { data: currentJob, error: fetchError } = await supabaseClient
        .from('cron_jobs')
        .select('enabled')
        .eq('job_name', jobName)
        .single()

      if (fetchError) {
        throw new Error(`Failed to fetch job: ${fetchError.message}`)
      }

      const newEnabled = !currentJob.enabled

      // Update job status in database
      const { error: updateError } = await supabaseClient
        .from('cron_jobs')
        .update({ enabled: newEnabled })
        .eq('job_name', jobName)

      if (updateError) {
        throw new Error(`Failed to update job: ${updateError.message}`)
      }

      // Enable/disable the actual cron job
      if (newEnabled) {
        // Enable the cron job
        const { error: cronError } = await supabaseClient.rpc('enable_cron_job', {
          job_name: jobName
        })
        if (cronError) {
          console.error(`Failed to enable cron job ${jobName}:`, cronError)
        }
      } else {
        // Disable the cron job
        const { error: cronError } = await supabaseClient.rpc('disable_cron_job', {
          job_name: jobName
        })
        if (cronError) {
          console.error(`Failed to disable cron job ${jobName}:`, cronError)
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          enabled: newEnabled,
          message: `Cron job ${jobName} ${newEnabled ? 'enabled' : 'disabled'}` 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    if (action === 'list') {
      // Get all cron jobs
      const { data: cronJobs, error } = await supabaseClient
        .from('cron_jobs')
        .select('*')
        .order('job_name')

      if (error) {
        throw new Error(`Failed to fetch cron jobs: ${error.message}`)
      }

      return new Response(
        JSON.stringify({ success: true, cronJobs }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )

  } catch (error) {
    console.error('Cron manager error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})