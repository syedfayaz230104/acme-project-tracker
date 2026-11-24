import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Typography } from '@mui/material';

/** Fallback for unknown routes. */
export default function NotFoundPage() {
  return (
    <Box sx={{ textAlign: 'center', py: 8 }}>
      <Typography variant="h4" gutterBottom>Page not found</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>The page you are looking for does not exist.</Typography>
      <Button component={RouterLink} to="/" variant="contained">Back to dashboard</Button>
    </Box>
  );
}
