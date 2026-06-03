const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidBuildGradleFix(config) {
  return withProjectBuildGradle(config, (config) => {
    let content = config.modResults.contents;
    
    // Check if the workaround is already added
    if (!content.includes('project.plugins.withId(\'maven-publish\')')) {
      const workaround = `
subprojects { project ->
    project.plugins.withId('maven-publish') {
        def registerDummy = {
            def releaseComponent = project.components.findByName('release')
            if (releaseComponent == null) {
                def softwareComponentFactory = project.services.get(org.gradle.api.component.SoftwareComponentFactory)
                def dummyComponent = softwareComponentFactory.adhoc('release')
                project.components.add(dummyComponent)
            }
        }
        if (project.state.executed) {
            registerDummy()
        } else {
            project.afterEvaluate {
                registerDummy()
            }
        }
    }
}
`;
      config.modResults.contents = content + workaround;
      console.log('Successfully applied maven-publish release components fix to project build.gradle');
    }
    
    return config;
  });
};
