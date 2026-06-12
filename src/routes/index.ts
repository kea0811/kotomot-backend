import { Router } from 'express';
import projectsRouter from './projects';
import namespacesRouter from './namespaces';
import transferRouter from './transfer';
import apiKeysRouter from './apiKeys';
import translationsRouter from './translations';
import languagesRouter from './languages';
import teamsRouter from './teams';
import approvalsRouter from './approvals';
import reviewsRouter from './reviews';
import environmentsRouter from './environments';
import versionsRouter from './versions';
import integrationsRouter from './integrations';
import dashboardRouter from './dashboard';
import activitiesRouter from './activities';
import settingsRouter from './settings';
import demoRouter from './demo';

const router = Router();

router.use('/projects', projectsRouter);
// namespaces are nested under projects
router.use('/projects', namespacesRouter);
// export/import are nested under projects
router.use('/projects', transferRouter);
router.use('/user/api-keys', apiKeysRouter);
router.use('/translations', translationsRouter);
router.use('/languages', languagesRouter);
router.use('/teams', teamsRouter);
router.use('/approvals', approvalsRouter);
router.use('/reviews', reviewsRouter);
router.use('/environments', environmentsRouter);
router.use('/versions', versionsRouter);
router.use('/integrations', integrationsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/activities', activitiesRouter);
router.use('/settings', settingsRouter);
router.use('/auth', demoRouter);

router.get('/ping', (_req, res) => {
  res.json({ success: true, message: 'pong' });
});

export default router;
