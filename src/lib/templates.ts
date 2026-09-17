/**
 * Default message templates + a tiny placeholder engine.
 * Supported tokens: {{clientName}} {{amount}} {{dueDate}} {{invoiceNumber}} {{businessName}} {{payLink}}
 */

export const DEFAULT_EMAIL_TEMPLATE = `Hi {{clientName}},

Just a quick note about invoice {{invoiceNumber}} for {{amount}} from {{businessName}}.
It's due on {{dueDate}}.

You can view and pay it here:
{{payLink}}

Thanks!`;

export const DEFAULT_WHATSAPP_TEMPLATE = `Hi {{clientName}} 👋 Friendly reminder from {{businessName}}: invoice {{invoiceNumber}} for {{amount}} is due {{dueDate}}. View & pay: {{payLink}}`;

export const DEFAULT_THANK_YOU_TEMPLATE = `Hi {{clientName}},

Thanks so much for the payment on invoice {{invoiceNumber}}! It really means a lot to {{businessName}}.

If you have a moment, we'd love a quick review — it makes a huge difference for a small business like ours:
{{reviewLink}}

Thanks again 🙏`;

/**
 * Replace {{token}} placeholders. Unknown tokens are left as-is so
 * the user can spot them in the preview.
 */
export function render(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (full, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      const v = vars[key];
      return v === undefined || v === null ? "" : String(v);
    }
    return full;
  });
}

export type TemplateVars = {
  clientName?: string;
  amount?: string | number;
  dueDate?: string;
  invoiceNumber?: string;
  businessName?: string;
  payLink?: string;
  reviewLink?: string;
};
