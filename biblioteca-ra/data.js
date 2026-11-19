// Capa de dades: Supabase (si està configurat) o mode prova local.
// Taula "llibres" amb columnes: id (text) i estat ("lliure" | "pendent" | "escollit").
window.Data = (function () {
  var cfg = window.SUPABASE_CONFIG || {};
  var ok = typeof window.supabase !== 'undefined' &&
           cfg.url && cfg.url.indexOf('POSA') !== 0 &&
           cfg.anonKey && cfg.anonKey.indexOf('POSA') !== 0;
  var client = null;
  var cb = function () {};
  var local = {};

  function start(onChange, onError) {
    cb = onChange;
    if (!ok) { onChange({}); return; }
    try {
      client = window.supabase.createClient(cfg.url, cfg.anonKey);

      function fetchAll() {
        return client.from('llibres').select('id, estat').then(function (res) {
          if (res.error) throw res.error;
          var m = {};
          (res.data || []).forEach(function (row) { m[row.id] = row.estat; });
          onChange(m);
        });
      }

      fetchAll().catch(function (err) {
        console.error(err);
        if (onError) onError(err);
      });

      client.channel('llibres-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'llibres' }, function () {
          fetchAll().catch(console.error);
        })
        .subscribe();
    } catch (e) {
      console.error(e);
      if (onError) onError(e);
    }
  }

  // Passa un llibre de "lliure" a "pendent" només si encara està "lliure".
  function pick(id) {
    if (!ok) {
      if ((local[id] || 'lliure') !== 'lliure') return Promise.reject(new Error('no-lliure'));
      local[id] = 'pendent';
      cb(Object.assign({}, local));
      return Promise.resolve();
    }
    return client
      .from('llibres')
      .update({ estat: 'pendent', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('estat', 'lliure')
      .select()
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data || res.data.length === 0) throw new Error('no-lliure');
      });
  }

  return { mode: ok ? 'supabase' : 'local', start: start, pick: pick };
})();
