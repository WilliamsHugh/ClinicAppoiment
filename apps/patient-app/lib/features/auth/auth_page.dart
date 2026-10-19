import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'widgets/auth_header.dart';
import 'widgets/login_form.dart';
import 'widgets/register_form.dart';

/// AuthPage đã được tách chuyên nghiệp:
/// - widgets/auth_header.dart (giữ text kỳ vọng cho test)
/// - widgets/login_form.dart
/// - widgets/register_form.dart
/// - widgets/sso_buttons.dart (Google/Apple SSO)
/// Layout giữ tông Figma: nền ClinicColors.scaffold, card bo 20, bo input 24.
class AuthPage extends StatefulWidget {
  const AuthPage({
    required this.onLogin,
    required this.onRegister,
    super.key,
  });

  final Future<void> Function(String email, String password) onLogin;
  final Future<bool> Function(String name, String email, String password)
      onRegister;

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  String? _registrationNotice;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  void _handleRegisteredSuccess(String message) {
    setState(() {
      _registrationNotice = message;
    });
    _tab.animateTo(0);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: ClinicColors.scaffold,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                children: [
                  const AuthHeader(),
                  const SizedBox(height: 14),
                  if (_registrationNotice case final notice?) ...[
                    Container(
                      key: const Key('auth-register-success-banner'),
                      margin: const EdgeInsets.only(bottom: 14),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF0FDF4),
                        border: Border.all(color: const Color(0xFFBBF7D0)),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          const Icon(
                            Icons.check_circle_outline,
                            size: 20,
                            color: Color(0xFF166534),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              notice,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: Color(0xFF166534),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.06),
                          blurRadius: 16,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Column(
                      children: [
                        TabBar(
                          controller: _tab,
                          labelColor: ClinicColors.primary,
                          unselectedLabelColor: ClinicColors.muted,
                          indicatorColor: ClinicColors.primary,
                          indicatorWeight: 2.5,
                          indicatorSize: TabBarIndicatorSize.tab,
                          labelStyle: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 13,
                          ),
                          tabs: const [
                            Tab(text: 'Đăng nhập'),
                            Tab(text: 'Đăng ký'),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                          child: SizedBox(
                            height: 450,
                            child: TabBarView(
                              controller: _tab,
                              children: [
                                LoginForm(onSubmit: widget.onLogin),
                                RegisterForm(
                                  onSubmit: widget.onRegister,
                                  onRegisteredSuccess: _handleRegisteredSuccess,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
