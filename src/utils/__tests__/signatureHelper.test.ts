import { describe, it, expect } from 'vitest';
import {
  isValidSignatureSrc,
  buildPrincipalSignatureHtml,
  resolveClassTeacherSignature,
  buildClassTeacherSignatureHtml,
} from '../signatureHelper';
import { removeLightBackgroundFromRgba } from '../storageHelper';
import { Staff } from '../../types';

describe('signatureHelper & background transparency', () => {
  it('validates safe signature image URLs and rejects unsafe schemes', () => {
    expect(isValidSignatureSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isValidSignatureSrc('https://cdn.example.com/sig.png')).toBe(true);
    expect(isValidSignatureSrc('/assets/sig.png')).toBe(true);
    expect(isValidSignatureSrc('')).toBe(false);
    expect(isValidSignatureSrc(undefined)).toBe(false);
    expect(isValidSignatureSrc('javascript:alert(1)')).toBe(false);
    expect(isValidSignatureSrc('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('builds safe printable HTML with uploaded signature image or italic fallback', () => {
    const withSig = buildPrincipalSignatureHtml({
      principalSignatureUrl: 'data:image/png;base64,SIG123',
      principalNameEn: 'Amzad Hossain',
    });
    expect(withSig).toContain('<img src="data:image/png;base64,SIG123"');
    expect(withSig).toContain('Amzad Hossain');

    const textOnly = buildPrincipalSignatureHtml({
      principalSignatureUrl: '',
      principalNameEn: 'Amzad <Hossain>',
    });
    expect(textOnly).not.toContain('<img');
    expect(textOnly).toContain('Amzad &lt;Hossain&gt;');

    const empty = buildPrincipalSignatureHtml({});
    expect(empty).toBe('');
  });

  it('resolves class teacher signature across section, class, staff assignedClasses, and default fallback', () => {
    const staffList = [
      {
        id: 't1',
        employeeId: 'T-01',
        nameEn: 'Farhana Yasmin',
        nameBn: 'ফারহানা ইয়াসমিন',
        gender: 'Female',
        designation: 'Assistant Teacher',
        department: 'Science',
        role: 'teacher',
        email: 'f@school.com',
        phone: '01700000001',
        qualification: 'MSc',
        joiningDate: '2022-01-01',
        basicSalary: 20000,
        houseRentAllowance: 0,
        medicalAllowance: 0,
        otherAllowance: 0,
        providentFundDeduction: 0,
        assignedClasses: ['Class 9'],
        signatureUrl: 'data:image/png;base64,STAFF9SIG',
        status: 'active',
      } as Staff,
    ];

    const school = {
      classTeacherName: 'Default Teacher',
      classTeacherSignatureUrl: 'data:image/png;base64,DEFAULTSIG',
      classTeacherSignatures: {
        'Class 10': { name: 'Karim Uddin', signatureUrl: 'data:image/png;base64,C10SIG' },
        'Class 10_B': { name: 'Salma Akter', signatureUrl: 'data:image/png;base64,C10BSIG' },
        'Class 8': { name: 'Rafiq Ahmed' },
      },
    };

    expect(resolveClassTeacherSignature(school, 'Class 10', 'B', staffList)).toEqual({
      name: 'Salma Akter',
      signatureUrl: 'data:image/png;base64,C10BSIG',
    });

    expect(resolveClassTeacherSignature(school, 'Class 10', 'A', staffList)).toEqual({
      name: 'Karim Uddin',
      signatureUrl: 'data:image/png;base64,C10SIG',
    });

    // Class 8 sets explicit teacher name without image -> should not inherit default image
    expect(resolveClassTeacherSignature(school, 'Class 8', 'A', staffList)).toEqual({
      name: 'Rafiq Ahmed',
      signatureUrl: '',
    });

    // Class 9 falls back to active assigned staff
    expect(resolveClassTeacherSignature(school, 'Class 9', 'A', staffList)).toEqual({
      name: 'Farhana Yasmin',
      signatureUrl: 'data:image/png;base64,STAFF9SIG',
    });

    // Class 7 falls back to default school-wide class teacher signature
    expect(resolveClassTeacherSignature(school, 'Class 7', 'A', staffList)).toEqual({
      name: 'Default Teacher',
      signatureUrl: 'data:image/png;base64,DEFAULTSIG',
    });
  });

  it('builds safe HTML for Class Teacher signature and escapes unsafe characters', () => {
    const htmlWithImg = buildClassTeacherSignatureHtml(
      {
        classTeacherSignatures: {
          'Class 10': { name: 'A. <Khan>', signatureUrl: 'data:image/png;base64,CTSIG' },
        },
      },
      'Class 10',
      'A'
    );
    expect(htmlWithImg).toContain('<img src="data:image/png;base64,CTSIG"');
    expect(htmlWithImg).toContain('A. &lt;Khan&gt;');

    const htmlRejectBadUrl = buildClassTeacherSignatureHtml(
      {
        classTeacherSignatures: {
          'Class 10': { name: 'Teacher <X>', signatureUrl: 'javascript:alert(1)' },
        },
      },
      'Class 10',
      'A'
    );
    expect(htmlRejectBadUrl).not.toContain('<img');
    expect(htmlRejectBadUrl).toContain('Teacher &lt;X&gt;');
  });

  it('makes white paper background transparent while keeping dark ink strokes opaque', () => {
    // 2x2 RGBA buffer: (0,0)=white paper, (1,0)=dark blue ink, (0,1)=white paper, (1,1)=white paper
    const rgba = new Uint8ClampedArray([
      250, 250, 250, 255, // top-left white corner
      15, 35, 110, 255,   // dark blue signature stroke
      245, 245, 245, 255, // bottom-left white
      255, 255, 255, 255, // bottom-right white corner
    ]);

    const changed = removeLightBackgroundFromRgba(rgba, 2, 2);
    expect(changed).toBe(true);
    expect(rgba[3]).toBe(0);    // top-left transparent
    expect(rgba[7]).toBe(255);  // ink pixel preserved opaque
    expect(rgba[11]).toBe(0);   // bottom-left transparent
    expect(rgba[15]).toBe(0);   // bottom-right transparent
  });

  it('skips background stripping when PNG corners are already transparent', () => {
    // 3x3 RGBA buffer: all 4 corners transparent, center pixel (index 4 => byte 16) opaque light gray
    const rgba = new Uint8ClampedArray(3 * 3 * 4);
    rgba[16] = 220;
    rgba[17] = 220;
    rgba[18] = 220;
    rgba[19] = 255;

    const changed = removeLightBackgroundFromRgba(rgba, 3, 3);
    expect(changed).toBe(false);
    expect(rgba[19]).toBe(255); // interior pixel untouched
  });
});
