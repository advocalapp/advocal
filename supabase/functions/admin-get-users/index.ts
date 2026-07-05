import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    // Use service role to bypass RLS entirely
    const supabase = createClient(
      (Deno.env.get('APP_SUPABASE_URL') ?? Deno.env.get('SUPABASE_URL'))!,
      (Deno.env.get('APP_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const { p_search = '', p_status = 'all', p_page = 0, p_pagesize = 20 } =
      await req.json().catch(() => ({}));

    let query = supabase
      .from('profiles')
      .select('id, email, full_name, phone_number, bar_registration_number, chamber_name, city, subscription_status, subscription_plan, subscription_source, subscription_start_date, subscription_end_date, premium_start_date, premium_end_date, is_suspended, role, created_at, updated_at, cases(count)', { count: 'exact' })
      .eq('role', 'user')
      .order('created_at', { ascending: false });

    if (p_search) {
      query = query.or(
        `full_name.ilike.%${p_search}%,email.ilike.%${p_search}%,phone_number.ilike.%${p_search}%,bar_registration_number.ilike.%${p_search}%`
      );
    }
    if (p_status !== 'all') {
      query = query.eq('subscription_status', p_status);
    }

    query = query.range(p_page * p_pagesize, (p_page + 1) * p_pagesize - 1);

    const { data, error, count } = await query;

    if (error) return json({ error: error.message }, 500);

    // Flatten cases(count) aggregate → case_count number
    const rows = (data ?? []).map((row: any) => {
      const caseCount = Array.isArray(row.cases) && row.cases.length > 0
        ? (row.cases[0].count ?? 0)
        : 0;
      const { cases: _cases, ...rest } = row;
      return { ...rest, case_count: Number(caseCount) };
    });

    return json({ data: rows, count: count ?? 0 });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
