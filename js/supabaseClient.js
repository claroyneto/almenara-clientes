// La anon key es pública por diseño (protegida por RLS, no es un secreto)
// — mismo criterio que cualquier app Supabase del lado del cliente. Sin
// build step (igual que el resto de Almenara_Web), así que va hardcodeada
// acá en vez de leerse de una variable de entorno.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co'; // reemplazar tras Task 1
const SUPABASE_ANON_KEY = 'TU-ANON-KEY'; // reemplazar tras Task 1

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
