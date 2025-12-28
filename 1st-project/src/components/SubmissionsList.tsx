import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  IconButton,
  Button,
  Box,
} from '@mui/material';
import Grid from '@mui/material/Grid';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  getSubmissions,
  deleteSubmission,
  clearSubmissions,
  FormSubmission,
} from '../services/storage';

interface SubmissionsListProps {
  refresh?: number;
}

export default function SubmissionsList({ refresh }: SubmissionsListProps) {
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);

  const loadSubmissions = () => {
    setSubmissions(getSubmissions());
  };

  useEffect(() => {
    loadSubmissions();
  }, [refresh]);

  const handleDelete = (id: string) => {
    deleteSubmission(id);
    loadSubmissions();
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all submissions?')) {
      clearSubmissions();
      loadSubmissions();
    }
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(dateString));
  };

  if (submissions.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="h6" color="text.secondary">
          No submissions yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">Submissions</Typography>
        <Button variant="outlined" color="error" onClick={handleClearAll}>
          Clear All
        </Button>
      </Box>

      <Grid container spacing={2}>
        {submissions.map((submission) => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={submission.id}>
            <Card>
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <Typography variant="h6" component="div" gutterBottom>
                    {submission.name}
                  </Typography>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDelete(submission.id)}
                    aria-label="delete"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Box>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {submission.email}
                </Typography>

                <Typography variant="body2" sx={{ mt: 1 }}>
                  {submission.message}
                </Typography>

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 1, display: 'block' }}
                >
                  {formatDate(submission.createdAt)}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
