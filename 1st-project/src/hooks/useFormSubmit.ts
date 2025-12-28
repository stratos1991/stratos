import { useState } from 'react';
import { saveSubmission } from '../services/storage';

interface FormData {
  name: string;
  email: string;
  message: string;
}

export function useFormSubmit() {
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (data: FormData) => {
    saveSubmission(data);
    setIsSuccess(true);

    // Reset success message after 3 seconds
    setTimeout(() => {
      setIsSuccess(false);
    }, 3000);
  };

  return {
    handleSubmit,
    isSuccess,
  };
}
