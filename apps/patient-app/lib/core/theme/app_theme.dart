import 'package:flutter/material.dart';

/// Palette trích xuất chính xác từ mobile_ui.png
abstract final class ClinicColors {
  // Background tổng thể (hơi xanh rất nhạt như trong hình)
  static const scaffold = Color(0xFFEAF0FF);
  // Màu xanh primary của Figma - dùng cho chip, nút Book Session, welcome screen
  static const primary = Color(0xFF2D5BFF);
  static const primaryDark = Color(0xFF1E4FE0);
  // Màu thẻ / search
  static const card = Color(0xFFFFFFFF);
  // Màu text
  static const ink = Color(0xFF0F172A);
  static const muted = Color(0xFF64748B);
  static const mutedLight = Color(0xFF94A3B8);
  // Viền nhạt
  static const border = Color(0xFFE2E8F0);
  // Star
  static const star = Color(0xFF0F172A);
  static const starGold = Color(0xFFF59E0B);
}

// Theme được tinh chỉnh để bám sát mobile_ui.png
ThemeData buildPatientTheme() {
  const seed = ClinicColors.primary;
  final scheme = ColorScheme.fromSeed(
    seedColor: seed,
    primary: ClinicColors.primary,
    surface: ClinicColors.scaffold,
  );
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: ClinicColors.scaffold,
    fontFamily: 'Roboto',
    cardTheme: CardThemeData(
      color: ClinicColors.card,
      clipBehavior: Clip.antiAlias,
      margin: EdgeInsets.zero,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
      ),
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: ClinicColors.card,
      hintStyle: const TextStyle(color: ClinicColors.mutedLight, fontSize: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(24),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(24),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(24),
        borderSide: const BorderSide(color: ClinicColors.primary, width: 1.2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: ClinicColors.primary,
        foregroundColor: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        textStyle: const TextStyle(
          fontWeight: FontWeight.w700,
          fontSize: 14,
        ),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      indicatorColor: ClinicColors.primary.withOpacity(0.12),
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: ClinicColors.primary,
          );
        }
        return const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w500,
          color: ClinicColors.muted,
        );
      }),
    ),
    textTheme: const TextTheme(
      headlineSmall: TextStyle(
        fontWeight: FontWeight.w800,
        color: ClinicColors.ink,
        height: 1.1,
        letterSpacing: -0.5,
      ),
    ),
  );
}
