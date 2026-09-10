import 'package:flutter_test/flutter_test.dart';

import 'package:clinic_patient_app/main.dart';

void main() {
  testWidgets('renders patient app title', (tester) async {
    await tester.pumpWidget(const PatientApp());
    expect(find.text('Patient App'), findsOneWidget);
  });
}
