/**
 * Evidence-backed, non-intrusive remediation suggestions for a site owner.
 * Inputs are already sanitized findings and aggregated local logs. This module
 * is educational and does not provide attack steps or claim exploitability.
 */
import type {HeaderAudit} from "./defensive-header-audit";
import type {AccessAudit} from "./server-access-log";
import type {BrowserJournal} from "./network-journal";
import {reviewBrowserJournal} from "./network-journal";
export type DefenseAction={
  id:string;
  topic:"configuration"|"reliability"|"observability";
  priority:"investigate"|"improve"|"verify";
  title:string;
  evidence:string;
  nextStep:string;
  caveat:string;
};
export function buildDefenseActionPlan(
  header:HeaderAudit|null,server:AccessAudit|null,browser:BrowserJournal|null
):DefenseAction[]{
  const tasks:DefenseAction[]=[];
  const add=(topic:DefenseAction["topic"],priority:DefenseAction["priority"],id:string,
    title:string,evidence:string,nextStep:string,caveat:string)=>
    tasks.push({id,topic,priority,title,evidence,nextStep,caveat});
  if(header){
    for(const f of header.findings){
      if(f.severity==="pass")continue;
      add("configuration",f.severity==="review"?"investigate":"improve","header-"+f.id,
        f.title, "响应头审计提示："+f.reason, f.remedy,
        "仅根据人工粘贴的一组响应头判断，不证明整站配置或存在可利用漏洞。");
    }
  }
  if(server){
    if(server.serverResponses){
      add("reliability","investigate","server-5xx","排查服务端 5xx 记录",
        "当前上传样本有 "+server.serverResponses+" 条 5xx 状态码。",
        "对照部署时间、应用错误日志和服务健康指标，确认是否有发布故障、配置异常或上游依赖问题。",
        "5xx 可能来自多种正常故障原因，不能据此判断攻击。");
    }
    if(server.rateLimitedResponses){
      add("reliability","verify","server-429","复核站点限流策略",
        "样本有 "+server.rateLimitedResponses+" 条 HTTP 429。",
        "核对预期的访问配额、真实用户的错误反馈以及 CDN/反向代理的限流设置。",
        "429 仅说明请求被限流，不代表恶意行为。");
    }
    if(server.elevatedMinutes){
      add("observability","verify","server-volume","核对访问量上升的时间段",
        "有 "+server.elevatedMinutes+" 个分钟段高于该样本的简单基线。",
        "检查已知定时任务、公开活动、爬虫、部署和 CDN 缓存变化；与相同时间跨度的正常样本对照。",
        "采样不连续或文件不完整时，分钟基线可能有偏差。");
    }
    if(server.ignoredLines){
      add("observability","verify","server-log-format","校验服务器日志解析覆盖率",
        server.ignoredLines+" 行没有被当前 Common/Combined 解析器识别。",
        "确认服务器日志格式、时区和是否混入错误日志；使用受支持的日志样本重新导入。",
        "忽略的日志不会被计入任何统计。");
    }
  }
  if(browser){
    const r=reviewBrowserJournal(browser);
    if(r.transportErrors){
      add("reliability","investigate","browser-transport","核查浏览器传输异常",
        "已授权浏览器事件中有 "+r.transportErrors+" 条传输异常信号。",
        "对比 DNS/HTTPS 可达性、VPN 状态、服务端错误日志与同一时间窗口的正常访问。",
        "仅凭浏览器错误不能区分本地网络、服务端或代理问题。");
    }
    if(r.stalls){
      add("reliability","verify","browser-stall","分析停滞与长时间等待",
        "浏览器捕获 "+r.stalls+" 个停滞相关事件。",
        "查看页面网络瀑布图、资源规模、接口响应时间与客户端性能日志。",
        "事件不等于唯一请求；短时负载变化未必意味着异常。");
    }
    if(r.renderErrors){
      add("reliability","verify","browser-render","检查页面脚本和渲染错误",
        "日志出现 "+r.renderErrors+" 个渲染或脚本故障信号。",
        "在可复现的页面版本检查前端异常、部署版本与资源加载失败情况。",
        "页面错误不一定来自网络攻击或安全事件。");
    }
    if(r.downloadErrors){
      add("reliability","verify","browser-download","检查下载失败原因",
        "日志出现 "+r.downloadErrors+" 个下载故障信号。",
        "核对自有站点的下载响应状态、文件可用性与浏览器下载错误类型。",
        "记录不包含下载文件名或用户下载内容。");
    }
    if(r.coverageLimited){
      add("observability","verify","browser-coverage","标记浏览器日志缺口",
        "日志达到事件容量或已有 "+r.capacityDropped+" 条记录因容量限制被替换。",
        "限定监测时间、保留必要的聚合报告，并记录起止时间和授权范围。",
        "不能把记录缺失理解成期间没有发生事件。");
    }
  }
  const weight={investigate:0,verify:1,improve:2};
  return tasks.sort((a,b)=>weight[a.priority]-weight[b.priority]||a.id.localeCompare(b.id));
}
export function exportDefenseActionPlan(tasks:DefenseAction[]){
  return {
    schema:"openguin-defensive-action-plan-v1",createdAt:new Date().toISOString(),
    count:tasks.length,tasks,
    limits:"Derived only from supplied offline evidence. This is not a vulnerability scan or certification.",
    privacy:{rawServerLogs:false,rawBrowserTimeline:false,requestUrls:false,visitorIps:false},
  };
}
