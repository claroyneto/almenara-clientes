// La anon key es pública por diseño (protegida por RLS, no es un secreto)
// — mismo criterio que cualquier app Supabase del lado del cliente. Sin
// build step (igual que el resto de Almenara_Web), así que va hardcodeada
// acá en vez de leerse de una variable de entorno.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://zlqdvhoiywanieibkruf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpscWR2aG9peXdhbmllaWJrcnVmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMDAyNDYsImV4cCI6MjEwMjU3NjI0Nn0.z64BD2ZKT1HuaQJMujb3_lOrpX5bgV4G99MgZKP9DWM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
