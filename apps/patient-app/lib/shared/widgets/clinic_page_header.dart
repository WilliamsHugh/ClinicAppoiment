import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/theme/app_theme.dart';

class ClinicPageHeader extends StatelessWidget {
  const ClinicPageHeader({
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.bottom,
    this.padding = const EdgeInsets.fromLTRB(20, 12, 16, 16),
    this.bottomPadding = EdgeInsets.zero,
    this.borderRadius =
        const BorderRadius.vertical(bottom: Radius.circular(20)),
    this.overlayStyle = SystemUiOverlayStyle.light,
    super.key,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final Widget? bottom;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry bottomPadding;
  final BorderRadiusGeometry? borderRadius;
  final SystemUiOverlayStyle overlayStyle;

  @override
  Widget build(BuildContext context) {
    final content = DecoratedBox(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [ClinicColors.primary, ClinicColors.primaryDark],
        ),
        borderRadius: borderRadius,
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: padding,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (leading != null) ...[
                    IconTheme(
                      data: const IconThemeData(color: Colors.white),
                      child: leading!,
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Semantics(
                          header: true,
                          child: Text(
                            title,
                            softWrap: true,
                            style: const TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w700,
                              height: 1.25,
                              color: Colors.white,
                            ),
                          ),
                        ),
                        if (subtitle != null && subtitle!.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            subtitle!,
                            softWrap: true,
                            style: TextStyle(
                              fontSize: 13,
                              height: 1.35,
                              color: Colors.white.withValues(alpha: 0.95),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (trailing != null) ...[
                    const SizedBox(width: 8),
                    IconTheme(
                      data: const IconThemeData(color: Colors.white),
                      child: DefaultTextStyle.merge(
                        style: const TextStyle(color: Colors.white),
                        child: trailing!,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (bottom != null) Padding(padding: bottomPadding, child: bottom!),
          ],
        ),
      ),
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: overlayStyle,
      child: borderRadius == null
          ? content
          : ClipRRect(
              borderRadius: borderRadius!,
              child: content,
            ),
    );
  }
}
