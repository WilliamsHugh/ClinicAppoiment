import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../profile_validation.dart';

class SessionSecuritySection extends StatelessWidget {
  const SessionSecuritySection({
    required this.sessions,
    required this.loadingSessions,
    this.sessionsError,
    this.revokingSessionIds = const <String>{},
    this.onRefreshSessions,
    this.onRevokeSession,
    this.onSignOut,
    super.key,
  });

  final List<AuthSessionItem> sessions;
  final bool loadingSessions;
  final String? sessionsError;
  final Set<String> revokingSessionIds;
  final VoidCallback? onRefreshSessions;
  final Future<void> Function(AuthSessionItem session)? onRevokeSession;
  final VoidCallback? onSignOut;

  Future<void> _confirmAndRevoke(
    BuildContext context,
    AuthSessionItem session,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        scrollable: true,
        title: const Text('Thu hồi phiên đăng nhập?'),
        content: Text(
          'Thiết bị "${formatDeviceLabel(session.deviceInfo)}" sẽ bị đăng xuất khỏi tài khoản của bạn.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            key: Key('confirm-revoke-session-${session.sessionId}'),
            style: FilledButton.styleFrom(
              backgroundColor: ClinicColors.danger,
            ),
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: const Text('Thu hồi'),
          ),
        ],
      ),
    );
    if (confirmed == true && onRevokeSession != null) {
      await onRevokeSession!(session);
    }
  }

  Future<void> _confirmSignOut(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogCtx) => AlertDialog(
        scrollable: true,
        title: const Text('Xác nhận đăng xuất?'),
        content: const Text(
          'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản trên thiết bị này?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogCtx).pop(false),
            child: const Text('Hủy'),
          ),
          FilledButton(
            key: const Key('confirm-sign-out-button'),
            style: FilledButton.styleFrom(
              backgroundColor: ClinicColors.danger,
            ),
            onPressed: () => Navigator.of(dialogCtx).pop(true),
            child: const Text('Đăng xuất'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      onSignOut?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ClinicColors.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ClinicColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.security_outlined,
                size: 20,
                color: ClinicColors.primary,
              ),
              const SizedBox(width: 8),
              const Expanded(
                child: Text(
                  'Phiên đăng nhập & Bảo mật',
                  softWrap: true,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: ClinicColors.ink,
                  ),
                ),
              ),
              if (onRefreshSessions != null)
                IconButton(
                  tooltip: 'Làm mới phiên',
                  onPressed: loadingSessions ? null : onRefreshSessions,
                  icon: const Icon(
                    Icons.refresh_rounded,
                    size: 20,
                    color: ClinicColors.primary,
                  ),
                ),
            ],
          ),
          const Divider(height: 20, thickness: 0.8, color: ClinicColors.border),
          if (loadingSessions && sessions.isEmpty) ...[
            const LinearProgressIndicator(
              color: ClinicColors.primary,
              backgroundColor: ClinicColors.primarySoft,
            ),
            const SizedBox(height: 10),
            const Text(
              'Đang kiểm tra các phiên đăng nhập...',
              style: TextStyle(fontSize: 13, color: ClinicColors.muted),
            ),
          ] else if (sessionsError != null && sessions.isEmpty) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: ClinicColors.surfaceSubtle,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    sessionsError!,
                    style: const TextStyle(
                      fontSize: 13,
                      color: ClinicColors.muted,
                    ),
                  ),
                  if (onRefreshSessions != null) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      height: 48,
                      child: TextButton(
                        onPressed: onRefreshSessions,
                        child: const Text('Thử tải lại phiên'),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ] else if (sessions.isEmpty) ...[
            const Text(
              'Chưa có danh sách phiên đăng nhập hoạt động.',
              style: TextStyle(fontSize: 13, color: ClinicColors.muted),
            ),
          ] else ...[
            for (var i = 0; i < sessions.length; i++) ...[
              if (i > 0)
                const Divider(
                  height: 16,
                  thickness: 0.6,
                  color: ClinicColors.border,
                ),
              _SessionTile(
                session: sessions[i],
                revoking: revokingSessionIds.contains(sessions[i].sessionId),
                onRevoke: !sessions[i].isCurrent && onRevokeSession != null
                    ? () => _confirmAndRevoke(context, sessions[i])
                    : null,
              ),
            ],
          ],
          if (onSignOut != null) ...[
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton.icon(
                key: const Key('profile-sign-out-button'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: ClinicColors.danger,
                  side: const BorderSide(color: ClinicColors.danger),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: () => _confirmSignOut(context),
                icon: const Icon(Icons.logout_rounded),
                label: const Text('Đăng xuất'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SessionTile extends StatelessWidget {
  const _SessionTile({
    required this.session,
    required this.revoking,
    this.onRevoke,
  });

  final AuthSessionItem session;
  final bool revoking;
  final VoidCallback? onRevoke;

  (String label, Color bg, Color fg) get _stateBadge {
    switch (session.state) {
      case 'ACTIVE':
        return (
          'Đang hoạt động',
          ClinicColors.successLight,
          ClinicColors.success,
        );
      case 'LOCKED':
        return ('Đã khóa', ClinicColors.dangerLight, ClinicColors.danger);
      case 'PENDING_MFA':
        return (
          'Chờ xác thực',
          ClinicColors.warningLight,
          ClinicColors.warningDark,
        );
      default:
        return (
          session.state,
          ClinicColors.surfaceSubtle,
          ClinicColors.muted,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final (stateLabel, stateBg, stateFg) = _stateBadge;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const Icon(
                Icons.devices_outlined,
                size: 18,
                color: ClinicColors.primary,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  formatDeviceLabel(session.deviceInfo),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: ClinicColors.ink,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 6,
            children: [
              if (session.isCurrent)
                const _SessionChip(
                  label: 'Phiên hiện tại',
                  bg: ClinicColors.primarySoft,
                  fg: ClinicColors.primary,
                ),
              _SessionChip(label: stateLabel, bg: stateBg, fg: stateFg),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Hoạt động gần nhất: ${formatSessionTimeVn(session.lastActiveAt)}',
            style: const TextStyle(fontSize: 12, color: ClinicColors.muted),
          ),
          if (onRevoke != null) ...[
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton(
                key: Key('revoke-session-${session.sessionId}'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: ClinicColors.danger,
                  side: const BorderSide(color: ClinicColors.danger),
                  minimumSize: const Size(88, 48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                onPressed: revoking ? null : onRevoke,
                child: revoking
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: ClinicColors.danger,
                        ),
                      )
                    : const Text('Thu hồi'),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _SessionChip extends StatelessWidget {
  const _SessionChip({
    required this.label,
    required this.bg,
    required this.fg,
  });

  final String label;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: fg,
        ),
      ),
    );
  }
}
