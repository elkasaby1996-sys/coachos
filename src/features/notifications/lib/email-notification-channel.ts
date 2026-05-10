import {
  resolveNotificationActionUrl,
  type NotificationAudience,
} from "./notification-route-resolver";
import type {
  NotificationDeliveryStatus,
  NotificationRecord,
  NotificationType,
} from "./types";

type EmailTemplateDefinition = {
  key: string;
  subject: string;
  requiredVariables: string[];
};

export type RenderedNotificationEmail = {
  templateKey: string;
  subject: string;
  preview: string;
  html: string;
  text: string;
};

export type EmailDeliveryPatch = {
  provider: string;
  status: NotificationDeliveryStatus;
  provider_message_id: string | null;
  failure_code: string | null;
  failure_reason: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
};

const clientTemplates: Partial<
  Record<NotificationType, EmailTemplateDefinition>
> = {
  workout_assigned: {
    key: "client.workout_assigned",
    subject: "Workout assigned",
    requiredVariables: ["recipient_name", "action_url"],
  },
  program_assigned: {
    key: "client.program_assigned",
    subject: "Program assigned",
    requiredVariables: ["recipient_name", "action_url"],
  },
  habit_assigned: {
    key: "client.habit_assigned",
    subject: "Habit assigned",
    requiredVariables: ["recipient_name", "action_url"],
  },
  checkin_requested: {
    key: "client.checkin_due",
    subject: "Check-in due",
    requiredVariables: ["recipient_name", "action_url"],
  },
  message_received: {
    key: "client.message_received",
    subject: "New coach message",
    requiredVariables: ["recipient_name", "action_url"],
  },
  file_shared: {
    key: "client.file_shared",
    subject: "New resource shared",
    requiredVariables: ["recipient_name", "action_url"],
  },
};

const ptTemplates: Partial<Record<NotificationType, EmailTemplateDefinition>> =
  {
    join_request_submitted: {
      key: "pt.join_request_submitted",
      subject: "New client join request",
      requiredVariables: ["recipient_name", "action_url"],
    },
    team_invite_received: {
      key: "pt.workspace_team_invite",
      subject: "Workspace team invite",
      requiredVariables: ["recipient_name", "action_url"],
    },
    client_inactive: {
      key: "pt.client_escalation",
      subject: "Client needs attention",
      requiredVariables: ["recipient_name", "action_url"],
    },
    checkin_submitted: {
      key: "pt.missed_checkin_summary",
      subject: "Check-in activity update",
      requiredVariables: ["recipient_name", "action_url"],
    },
    system: {
      key: "pt.product_update",
      subject: "RepSync update",
      requiredVariables: ["recipient_name", "action_url"],
    },
  };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTemplateDefinition(
  audience: NotificationAudience,
  type: NotificationType,
) {
  const template =
    audience === "client" ? clientTemplates[type] : ptTemplates[type];

  return (
    template ?? {
      key: `${audience}.${type}`,
      subject: "RepSync notification",
      requiredVariables: ["recipient_name", "action_url"],
    }
  );
}

function getStringMetadata(notification: NotificationRecord, key: string) {
  const value = notification.metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function getEmailTemplateKey(
  audience: NotificationAudience,
  type: NotificationType,
) {
  return getTemplateDefinition(audience, type).key;
}

export function validateEmailTemplateVariables(params: {
  audience: NotificationAudience;
  notification: NotificationRecord;
  templateKey: string;
}) {
  const template = getTemplateDefinition(
    params.audience,
    params.notification.type,
  );
  const missing = template.requiredVariables.filter(
    (key) => !getStringMetadata(params.notification, key),
  );

  if (params.templateKey !== template.key) {
    throw new Error(
      `Email template key mismatch: expected ${template.key}, received ${params.templateKey}.`,
    );
  }

  if (missing.length > 0) {
    throw new Error(`Missing email template variables: ${missing.join(", ")}`);
  }
}

export function renderNotificationEmail(params: {
  audience: NotificationAudience;
  notification: NotificationRecord;
}): RenderedNotificationEmail {
  const template = getTemplateDefinition(
    params.audience,
    params.notification.type,
  );
  const actionUrl = resolveNotificationActionUrl(
    params.notification,
    params.audience,
  );
  const notificationWithResolvedAction = {
    ...params.notification,
    metadata: {
      ...params.notification.metadata,
      action_url: actionUrl,
      recipient_name:
        getStringMetadata(params.notification, "recipient_name") ?? "there",
    },
  };

  validateEmailTemplateVariables({
    audience: params.audience,
    notification: notificationWithResolvedAction,
    templateKey: template.key,
  });

  const recipientName =
    getStringMetadata(notificationWithResolvedAction, "recipient_name") ??
    "there";
  const title = params.notification.title || template.subject;
  const body = params.notification.body || "You have a new RepSync update.";
  const preview = `${template.subject}: ${body}`;
  const safeName = escapeHtml(recipientName);
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  const safeActionUrl = escapeHtml(actionUrl);

  return {
    templateKey: template.key,
    subject: template.subject,
    preview,
    text: [`Hi ${recipientName},`, body, `Open in RepSync: ${actionUrl}`].join(
      "\n\n",
    ),
    html: [
      `<p>Hi ${safeName},</p>`,
      `<h1>${safeTitle}</h1>`,
      `<p>${safeBody}</p>`,
      `<p><a href="${safeActionUrl}">Open in RepSync</a></p>`,
    ].join(""),
  };
}

export function buildEmailDeliveryPatch(params: {
  provider: string;
  status: NotificationDeliveryStatus;
  providerMessageId?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
}): EmailDeliveryPatch {
  const now = new Date().toISOString();
  return {
    provider: params.provider,
    status: params.status,
    provider_message_id: params.providerMessageId?.trim() || null,
    failure_code: params.failureCode?.trim() || null,
    failure_reason: params.failureReason?.trim() || null,
    sent_at:
      params.status === "sent" || params.status === "delivered" ? now : null,
    delivered_at: params.status === "delivered" ? now : null,
  };
}
