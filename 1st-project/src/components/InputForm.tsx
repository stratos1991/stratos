import { useForm } from 'react-hook-form';
import { TextField, Button, Box, Alert, Paper } from '@mui/material';
import { useFormSubmit } from '../hooks/useFormSubmit';

interface FormData {
  name: string;
  email: string;
  message: string;
}

interface InputFormProps {
  onSubmitSuccess?: () => void;
}

export default function InputForm({ onSubmitSuccess }: InputFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>();

  const { handleSubmit: submitToStorage, isSuccess } = useFormSubmit();

  const onSubmit = (data: FormData) => {
    submitToStorage(data);
    reset();
    if (onSubmitSuccess) {
      onSubmitSuccess();
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, maxWidth: 600, mx: 'auto' }}>
      <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField
          fullWidth
          label="Name"
          margin="normal"
          {...register('name', { required: 'Name is required' })}
          error={!!errors.name}
          helperText={errors.name?.message}
        />

        <TextField
          fullWidth
          label="Email"
          type="email"
          margin="normal"
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: 'Invalid email address',
            },
          })}
          error={!!errors.email}
          helperText={errors.email?.message}
        />

        <TextField
          fullWidth
          label="Message"
          multiline
          rows={4}
          margin="normal"
          {...register('message', { required: 'Message is required' })}
          error={!!errors.message}
          helperText={errors.message?.message}
        />

        <Button
          type="submit"
          variant="contained"
          fullWidth
          sx={{ mt: 2 }}
        >
          Submit
        </Button>

        {isSuccess && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Form submitted successfully!
          </Alert>
        )}
      </Box>
    </Paper>
  );
}
