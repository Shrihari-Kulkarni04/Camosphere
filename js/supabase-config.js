// supabase-config.js

const SUPABASE_URL = 'https://aswlorfbsugnbucwvbzy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzd2xvcmZic3VnbmJ1Y3d2Ynp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2NjM3MDQsImV4cCI6MjA4MjIzOTcwNH0.FqwHv4f1eA-xDFojda_sGEUuOV-09lx19D8rThUrbRg';

const SUPABASE_TABLES = {
  admin: 'Admin',
  existingStudent: 'Existing Student',
  newStudent: 'New Student',
  faculty: 'faculty',
  departmentFaculty: 'faculty_details',
  visitors: 'visitors',
  events: 'events'
};

function supabaseHeaders(extraHeaders) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    ...extraHeaders
  };
}

function tableUrl(tableName) {
  return `${SUPABASE_URL}/rest/v1/${encodeURIComponent(tableName)}`;
}

function addFilters(url, filters) {
  Object.entries(filters || {}).forEach(function ([column, value]) {
    url.searchParams.set(column, 'eq.' + value);
  });
}

async function parseSupabaseResponse(res) {
  const text = await res.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch (error) {
    body = text;
  }

  if (!res.ok) {
    return {
      data: null,
      error: {
        status: res.status,
        message: body && body.message ? body.message : 'Supabase request failed.',
        details: body && body.details ? body.details : '',
        hint: body && body.hint ? body.hint : '',
        raw: body
      }
    };
  }

  return { data: body, error: null };
}

window.CamosphereSupabase = {
  tables: SUPABASE_TABLES,

  async insert(tableName, values) {
    const res = await fetch(tableUrl(tableName), {
      method: 'POST',
      headers: supabaseHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify(values)
    });

    return parseSupabaseResponse(res);
  },

  async maybeSingle(tableName, filters) {
    const url = new URL(tableUrl(tableName));
    url.searchParams.set('select', '*');
    url.searchParams.set('limit', '1');
    addFilters(url, filters);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: supabaseHeaders()
    });

    const result = await parseSupabaseResponse(res);
    if (result.error) return result;

    return {
      data: Array.isArray(result.data) && result.data.length ? result.data[0] : null,
      error: null
    };
  },

  async select(tableName, options) {
    const config = options || {};
    const url = new URL(tableUrl(tableName));

    url.searchParams.set('select', config.columns || '*');
    if (config.order) {
      url.searchParams.set('order', config.order);
    }
    addFilters(url, config.filters);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: supabaseHeaders()
    });

    return parseSupabaseResponse(res);
  },

  async testDepartmentFaculty() {
    return this.select(this.tables.departmentFaculty, {
      columns: '*'
    });
  }
};
