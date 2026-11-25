export interface GradeInfo {
  grade: 'A+' | 'A' | 'A-' | 'B' | 'C' | 'D' | 'F';
  gpa: number;
  remarksEn: string;
  remarksBn: string;
}

export function calculateSubjectGrade(marks: number, fullMarks: number = 100): GradeInfo {
  // Normalize to 100 scale
  const percentage = fullMarks > 0 ? (marks / fullMarks) * 100 : marks;
  if (percentage >= 80) {
    return { grade: 'A+', gpa: 5.0, remarksEn: 'Outstanding', remarksBn: 'অসাধারণ' };
  } else if (percentage >= 70) {
    return { grade: 'A', gpa: 4.0, remarksEn: 'Excellent', remarksBn: 'খুব ভালো' };
  } else if (percentage >= 60) {
    return { grade: 'A-', gpa: 3.5, remarksEn: 'Very Good', remarksBn: 'উত্তম' };
  } else if (percentage >= 50) {
    return { grade: 'B', gpa: 3.0, remarksEn: 'Good', remarksBn: 'ভালো' };
  } else if (percentage >= 40) {
    return { grade: 'C', gpa: 2.0, remarksEn: 'Satisfactory', remarksBn: 'সন্তোষজনক' };
  } else if (percentage >= 33) {
    return { grade: 'D', gpa: 1.0, remarksEn: 'Pass', remarksBn: 'উত্তীর্ণ' };
  } else {
    return { grade: 'F', gpa: 0.0, remarksEn: 'Fail', remarksBn: 'অনুত্তীর্ণ' };
  }
}

export function getGradeFromGPA(gpa: number): string {
  if (gpa >= 5.0) return 'A+';
  if (gpa >= 4.0) return 'A';
  if (gpa >= 3.5) return 'A-';
  if (gpa >= 3.0) return 'B';
  if (gpa >= 2.0) return 'C';
  if (gpa >= 1.0) return 'D';
  return 'F';
}

export function calculateTotalGPA(subjectGPAs: number[], hasAnyFail: boolean): { totalGPA: number; overallGrade: string; status: 'PASSED' | 'FAILED' } {
  if (hasAnyFail || subjectGPAs.length === 0) {
    return { totalGPA: 0.0, overallGrade: 'F', status: 'FAILED' };
  }
  const sum = subjectGPAs.reduce((acc, curr) => acc + curr, 0);
  const avg = Number((sum / subjectGPAs.length).toFixed(2));
  const capped = Math.min(5.0, avg);
  const overallGrade = getGradeFromGPA(capped);

  return { totalGPA: capped, overallGrade, status: 'PASSED' };
}

export interface ExamGPABreakdown {
  examId: string;
  examName: string;
  gpa: number;
  overallGrade: string;
  totalObtained: number;
  fullMarks: number;
  hasFail: boolean;
  hasData: boolean;
  weight?: number;
}

export type CombinedPassPolicy = 'strict_all_exams' | 'cumulative_cgpa';

export function calculateCombinedCGPA(
  examBreakdowns: ExamGPABreakdown[],
  passPolicy: CombinedPassPolicy = 'strict_all_exams'
): {
  cgpa: number;
  overallGrade: string;
  status: 'PASSED' | 'FAILED';
  totalObtained: number;
  totalFullMarks: number;
  examsCompletedCount: number;
  failedExamsCount: number;
} {
  if (examBreakdowns.length === 0) {
    return {
      cgpa: 0,
      overallGrade: 'F',
      status: 'FAILED',
      totalObtained: 0,
      totalFullMarks: 0,
      examsCompletedCount: 0,
      failedExamsCount: 0,
    };
  }

  let totalObtained = 0;
  let totalFullMarks = 0;
  let weightedGpaSum = 0;
  let totalWeight = 0;
  let examsCompletedCount = 0;
  let failedExamsCount = 0;

  for (const ex of examBreakdowns) {
    const w = ex.weight && ex.weight > 0 ? ex.weight : 1;
    totalObtained += ex.totalObtained;
    totalFullMarks += ex.fullMarks;
    if (ex.hasData) {
      examsCompletedCount++;
    }
    if (!ex.hasData || ex.hasFail) {
      failedExamsCount++;
    }
    weightedGpaSum += ex.gpa * w;
    totalWeight += w;
  }

  if (examsCompletedCount === 0) {
    return {
      cgpa: 0,
      overallGrade: 'F',
      status: 'FAILED',
      totalObtained: 0,
      totalFullMarks: 0,
      examsCompletedCount: 0,
      failedExamsCount: examBreakdowns.length,
    };
  }

  const rawCgpa = totalWeight > 0 ? Number((weightedGpaSum / totalWeight).toFixed(2)) : 0;
  const cappedCgpa = Math.min(5.0, Math.max(0, rawCgpa));

  if (passPolicy === 'strict_all_exams' && failedExamsCount > 0) {
    return {
      cgpa: 0,
      overallGrade: 'F',
      status: 'FAILED',
      totalObtained,
      totalFullMarks,
      examsCompletedCount,
      failedExamsCount,
    };
  }

  if (passPolicy === 'cumulative_cgpa' && cappedCgpa < 1.0) {
    return {
      cgpa: 0,
      overallGrade: 'F',
      status: 'FAILED',
      totalObtained,
      totalFullMarks,
      examsCompletedCount,
      failedExamsCount,
    };
  }

  const overallGrade = getGradeFromGPA(cappedCgpa);
  return {
    cgpa: cappedCgpa,
    overallGrade,
    status: overallGrade === 'F' ? 'FAILED' : 'PASSED',
    totalObtained,
    totalFullMarks,
    examsCompletedCount,
    failedExamsCount,
  };
}

