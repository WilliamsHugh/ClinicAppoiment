import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../onboarding/welcome_page.dart';
import 'widgets/auth_header.dart';
import 'widgets/login_form.dart';
import 'widgets/register_form.dart';
import 'widgets/sso_buttons.dart';

/// AuthPage đã được tách chuyên nghiệp:
/// - widgets/auth_header.dart (giữ text kỳ vọng cho test)
/// - widgets/login_form.dart
/// - widgets/register_form.dart
/// - widgets/sso_buttons.dart (Google/Apple SSO)
/// Layout giữ tông Figma: nền ClinicColors.scaffold, card bo 20, bo input 24.
class AuthPage extends StatefulWidget {
  const AuthPage({super.key});

  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;

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
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.black.withOpacity(0.06),
                            blurRadius: 16,
                            offset: const Offset(0, 8))
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
                              fontWeight: FontWeight.w700, fontSize: 13),
                          tabs: const [
                            Tab(text: 'Đăng nhập'),
                            Tab(text: 'Đăng ký'),
                          ],
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                          child: SizedBox(
                            height: 360,
                            child: TabBarView(
                              controller: _tab,
                              children: const [
                                LoginForm(),
                                RegisterForm(),
                              ],
                            ),
                          ),
                        ),
                        const Padding(
                          padding: EdgeInsets.fromLTRB(16, 0, 16, 16),
                          child: SsoButtons(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => WelcomePage(
                            onGetStarted: () => Navigator.of(context).pop()),
                      ),
                    ),
                    icon: const Icon(Icons.auto_awesome, size: 16),
                    label: const Text('Xem màn Welcome (mobile_ui - giữa)',
                        style: TextStyle(fontSize: 12)),
                    style: OutlinedButton.styleFrom(
                      backgroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 10),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Tab Bác sĩ = màn trái Figma • Tap bác sĩ → màn phải (chọn khung giờ → đặt lịch)',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 10,
                        color: Colors.black.withOpacity(0.45)),
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
