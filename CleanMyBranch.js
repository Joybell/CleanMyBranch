#!/usr/bin/env node
const axios = require('axios').default
const shell = require('shelljs')
const inquirer = require('inquirer') 
const fs = require('fs')
const colors = require('colors')

class CleanMyBranch {
  constructor() {
    this.jiraDomain = 'jira.atlassian.com'
    this.encodedAccount = ''
    this.run()
  }

  async run() {
    try {
      const projectList = await this.getProjectList()
      const chooseProject = await this.getProject(projectList)
      const account = await this.getAccount()

      if (!account) {
        throw 'JIRA Login Failed'
      }

      this.encodedAccount = new Buffer(`${account.username}:${account.password}`).toString('base64')

      const branchList = await this.getBranchList(chooseProject.project)
      const itemList = branchList.stdout.split('\n').map(x => ({
        branch: x.replace('*', '').trim(),
        jira: x.match(/(?<=\/)[A-Z]*\-[0-9]*/g)
      }))

      itemList.forEach(async (item, index) => {
        if (index === 0) {
          this.print('\n[ Jira Issue ]', 'green')
        }

        let jiraId = item.jira && item.jira[0]       
        
        if (jiraId) {        
          let jiraIssue = await this.getJiraIssue(jiraId)

          if (jiraIssue.errorMessage) {
            this.print(`${jiraId} => ${jiraIssue.errorMessage}`)
          } else {
            let jiraStatus = jiraIssue.data.fields.status.name
          
            this.print(`${jiraId} => ${jiraStatus}`)
  
            if (['Closed', 'Close'].includes(jiraStatus)) {
              this.print(`delete branch: ${item.branch}`, 'red')
              await this.deleteBranch(item.branch)
            }
          }
        }
      })
    } catch (e) {
      this.print(`\n${e}\n`, 'red')
    }
  }

  async getAccount() {
    const account = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Jira Username:'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Jira Password:',
      }
    ])  

    try {
      const result = await axios({
        method: 'post',
        url: `http://${this.jiraDomain}/rest/auth/1/session`,
        data: {
          username: account.username,
          password: account.password
        }
      })

      if (result) {
        return account
      }
    } catch (e) {
      return false
    }
  }

  async getProjectList() {
    return new Promise((resolve, reject) => {
      const projectList = []
      
      shell.cd('../')
      fs.readdir('./', (err, itemList) => {
        itemList.forEach(item => {
          if (!['.git', '.DS_Store', 'CleanMyBranch'].includes(item)) {
            if (fs.lstatSync(item).isDirectory()) {
              projectList.push(item)
            }
          }
        })

        resolve(projectList)
      })
    })
  }

  async getProject(projectList) {
    return await inquirer.prompt([
      {
        type: 'list',
        name: 'project',
        message: 'Choose a Project',
        choices: [ ...projectList ],
      },
    ])
  }

  async getBranchList(project) {
    shell.cd(project)
    this.print('\n[ Branch List ]', 'green')
    return await shell.exec('git branch')
  }

  async getJiraIssue(issue) {
    try {
      return await axios({
        method: 'get',
        url: `http://${this.jiraDomain}/rest/api/2/issue/${issue}`,
        headers: {
          Authorization: `Basic ${this.encodedAccount}`
        }
      })
    } catch (e) {
      return {
        errorMessage: e.message
      }
    }
  }

  async deleteBranch(branch) {
    await shell.exec(`git branch -D ${branch}`)
    await shell.exec(`git push origin :${branch}`)
  }

  print(message, color) {
    console.log(colors[color || 'white'](`${message}`))
  }
}

new CleanMyBranch()


