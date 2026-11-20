import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../notification_models.dart';

class NotificationTile extends StatelessWidget {
  const NotificationTile({
    required this.notification,
    required this.onTap,
    this.onMarkRead,
    this.markingRead = false,
    super.key,
  });

  final AppNotification notification;
  final VoidCallback onTap;
  final VoidCallback? onMarkRead;
  final bool markingRead;

  @override
  Widget build(BuildContext context) {
    final unread = notification.isUnread;
    final meta = notification.typeMeta;
    final cardBackground = unread
        ? Color.lerp(ClinicColors.card, ClinicColors.primarySoft, 0.45)!
        : ClinicColors.card;
    final borderColor = unread
        ? ClinicColors.primary.withValues(alpha: 0.35)
        : ClinicColors.border;
    final routeHint = notification.routeHintLabel;
    final timestamp = notification.formattedCreatedAt;
    final showFooter = routeHint != null || (unread && onMarkRead != null);

    return Material(
      color: cardBackground,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: borderColor),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                      color: unread
                          ? meta.backgroundColor
                          : ClinicColors.surfaceSubtle,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      meta.icon,
                      size: 19,
                      color: unread ? meta.foregroundColor : ClinicColors.muted,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 6,
                          runSpacing: 4,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            _StatusPill(
                              label: meta.label,
                              foregroundColor: meta.foregroundColor,
                              backgroundColor: meta.backgroundColor,
                            ),
                            if (unread)
                              const _StatusPill(
                                label: 'Chưa đọc',
                                foregroundColor: ClinicColors.primaryDark,
                                backgroundColor: ClinicColors.primarySoft,
                                showDot: true,
                              )
                            else if (notification.isFailed)
                              const _StatusPill(
                                label: 'Gửi lỗi',
                                foregroundColor: ClinicColors.danger,
                                backgroundColor: ClinicColors.dangerLight,
                              ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          notification.title,
                          softWrap: true,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight:
                                unread ? FontWeight.w700 : FontWeight.w600,
                            color: ClinicColors.ink,
                            height: 1.35,
                          ),
                        ),
                        if (notification.message.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            notification.message,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 13,
                              color: ClinicColors.muted,
                              height: 1.4,
                            ),
                          ),
                        ],
                        if (timestamp.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Icon(
                                Icons.schedule,
                                size: 13,
                                color: ClinicColors.muted,
                              ),
                              const SizedBox(width: 4),
                              Flexible(
                                child: Text(
                                  timestamp,
                                  softWrap: true,
                                  style: const TextStyle(
                                    fontSize: 12,
                                    color: ClinicColors.muted,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              if (showFooter) ...[
                const SizedBox(height: 10),
                const Divider(height: 1),
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (routeHint != null)
                      Expanded(
                        child: Row(
                          children: [
                            const Icon(
                              Icons.arrow_forward_rounded,
                              size: 15,
                              color: ClinicColors.primary,
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Text(
                                routeHint,
                                softWrap: true,
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: ClinicColors.primary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      )
                    else
                      const Spacer(),
                    if (unread && onMarkRead != null) ...[
                      const SizedBox(width: 8),
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        excludeFromSemantics: true,
                        onTap: () {},
                        child: TextButton(
                          onPressed: markingRead ? null : onMarkRead,
                          style: TextButton.styleFrom(
                            foregroundColor: ClinicColors.primary,
                            minimumSize: const Size(48, 48),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            textStyle: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              Opacity(
                                opacity: markingRead ? 0 : 1,
                                child: const Text('Đã đọc'),
                              ),
                              if (markingRead)
                                const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.label,
    required this.foregroundColor,
    required this.backgroundColor,
    this.showDot = false,
  });

  final String label;
  final Color foregroundColor;
  final Color backgroundColor;
  final bool showDot;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showDot) ...[
            Container(
              width: 7,
              height: 7,
              decoration: BoxDecoration(
                color: foregroundColor,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: foregroundColor,
            ),
          ),
        ],
      ),
    );
  }
}
