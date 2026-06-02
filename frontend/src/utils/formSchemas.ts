/**
 * Zod validation schemas for PresuControl forms.
 * Mirrors backend Pydantic schemas for client-side validation.
 */
import { z } from 'zod'

// ── Shared fragments ──────────────────────────────────────────────

const trimString = z.string().trim()

const optionalTrim = trimString.optional().nullable()

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')

const optionalDate = dateString.optional().nullable()

const euroAmount = z.number().min(0, 'El importe no puede ser negativo').optional().nullable()

// ── Presupuesto ───────────────────────────────────────────────────

export const presupuestoSchema = z.object({
  numero_presupuesto: trimString.min(1, 'El nº de presupuesto es obligatorio'),
  cliente: trimString.min(1, 'El cliente es obligatorio'),
  obra_referencia: optionalTrim,
  gestor: optionalTrim,
  fecha_presupuesto: optionalDate,
  importe: z.number().min(0, 'El importe no puede ser negativo'),
  estado: trimString.min(1, 'El estado es obligatorio'),
  proveedor: optionalTrim,
  numero_pedido_cliente: optionalTrim,
  codigo_cliente_factusol: optionalTrim,
  numero_pedido_proveedor: optionalTrim,
  fecha_pedido_proveedor: optionalDate,
  plazo_proveedor: optionalTrim,
  fecha_prevista_entrega: optionalDate,
  responsable_actual: optionalTrim,
  siguiente_accion: optionalTrim,
  fecha_limite_siguiente_accion: optionalDate,
  observaciones: optionalTrim,
  etiquetas: optionalTrim,
  incidencia: z.boolean().optional(),
})

export type PresupuestoFormData = z.infer<typeof presupuestoSchema>

// ── Pedido Proveedor ──────────────────────────────────────────────

export const pedidoProveedorSchema = z.object({
  proveedor: trimString.min(1, 'El proveedor es obligatorio'),
  proveedor_id: z.number().optional().nullable(),
  numero_pedido: optionalTrim,
  fecha_pedido: optionalDate,
  importe: euroAmount,
  estado_entrega: z.enum(['pendiente', 'parcial', 'completado']).optional(),
  fecha_entrega_prevista: optionalDate,
  fecha_entrega_real: optionalDate,
  observaciones: optionalTrim,
})

export type PedidoProveedorFormData = z.infer<typeof pedidoProveedorSchema>

// ── Proveedor ─────────────────────────────────────────────────────

export const proveedorSchema = z.object({
  nombre: trimString.min(1, 'El nombre del proveedor es obligatorio'),
  contacto: optionalTrim,
  email: trimString.email('Email inválido').optional().nullable().or(z.literal('')),
  telefono: optionalTrim,
  direccion: optionalTrim,
  notas: optionalTrim,
})

export type ProveedorFormData = z.infer<typeof proveedorSchema>

// ── Auth ──────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: trimString.email('Email inválido').min(1, 'El email es obligatorio'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

export type LoginFormData = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  nombre: trimString.min(1, 'El nombre es obligatorio').max(120, 'Máximo 120 caracteres'),
  email: trimString.email('Email inválido').min(1, 'El email es obligatorio'),
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
    .regex(/[a-z]/, 'Debe contener al menos una minúscula')
    .regex(/[0-9]/, 'Debe contener al menos un número'),
  password_confirm: z.string(),
}).refine(data => data.password === data.password_confirm, {
  message: 'Las contraseñas no coinciden',
  path: ['password_confirm'],
})

export type RegisterFormData = z.infer<typeof registerSchema>

// ── Configuración ─────────────────────────────────────────────────

export const smtpSettingsSchema = z.object({
  smtp_host: trimString.optional().nullable(),
  smtp_port: z.number().int().min(1).max(65535).optional(),
  smtp_user: trimString.optional().nullable(),
  smtp_password: trimString.optional().nullable(),
  smtp_from: trimString.email('Email inválido').optional().nullable().or(z.literal('')),
  smtp_tls: z.boolean().optional(),
})

export type SmtpSettingsFormData = z.infer<typeof smtpSettingsSchema>

// ── User management ───────────────────────────────────────────────

export const userCreateSchema = z.object({
  nombre: trimString.min(1, 'El nombre es obligatorio').max(120),
  email: trimString.email('Email inválido').min(1, 'El email es obligatorio'),
  password: z.string().min(8, 'Al menos 8 caracteres'),
  rol: z.enum(['admin_sistema', 'gestion']).optional(),
})

export type UserCreateFormData = z.infer<typeof userCreateSchema>

// ── Helper ────────────────────────────────────────────────────────

/** Extract field-level errors from ZodError into a Record<string, string>. */
export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const path = issue.path.join('.')
    if (!errors[path]) {
      errors[path] = issue.message
    }
  }
  return errors
}
