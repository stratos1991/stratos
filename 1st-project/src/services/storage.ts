export interface FormSubmission {
  id: string;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

const STORAGE_KEY = 'form_submissions';

export function saveSubmission(
  data: Omit<FormSubmission, 'id' | 'createdAt'>
): FormSubmission {
  const submissions = getSubmissions();
  const newSubmission: FormSubmission = {
    ...data,
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
  };

  submissions.push(newSubmission);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions));

  return newSubmission;
}

export function getSubmissions(): FormSubmission[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch (error) {
    console.error('Error parsing submissions from localStorage:', error);
    return [];
  }
}

export function deleteSubmission(id: string): void {
  const submissions = getSubmissions();
  const filtered = submissions.filter(sub => sub.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function clearSubmissions(): void {
  localStorage.removeItem(STORAGE_KEY);
}
